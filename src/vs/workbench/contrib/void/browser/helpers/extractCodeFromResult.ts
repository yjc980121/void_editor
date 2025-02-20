/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { DIVIDER, FINAL, ORIGINAL } from '../prompt/prompts.js'

class SurroundingsRemover {
	readonly originalS: string
	i: number
	j: number

	// string is s[i...j]

	constructor(s: string) {
		this.originalS = s
		this.i = 0
		this.j = s.length - 1
	}
	value() {
		return this.originalS.substring(this.i, this.j + 1)
	}

	// returns whether it removed the whole prefix
	removePrefix = (prefix: string): boolean => {
		let offset = 0
		// console.log('prefix', prefix, Math.min(this.j, prefix.length - 1))
		while (this.i <= this.j && offset <= prefix.length - 1) {
			if (this.originalS.charAt(this.i) !== prefix.charAt(offset))
				break
			offset += 1
			this.i += 1
		}
		return offset === prefix.length
	}

	// // removes suffix from right to left
	removeSuffix = (suffix: string): boolean => {
		// e.g. suffix = <PRE/>, the string is <PRE>hi<P
		const s = this.value()
		// for every possible prefix of `suffix`, check if string ends with it
		for (let len = Math.min(s.length, suffix.length); len >= 1; len -= 1) {
			if (s.endsWith(suffix.substring(0, len))) { // the end of the string equals a prefix
				this.j -= len
				return len === suffix.length
			}
		}
		return false
	}
	// removeSuffix = (suffix: string): boolean => {
	// 	let offset = 0

	// 	while (this.j >= Math.max(this.i, 0)) {
	// 		if (this.originalS.charAt(this.j) !== suffix.charAt(suffix.length - 1 - offset))
	// 			break
	// 		offset += 1
	// 		this.j -= 1
	// 	}
	// 	return offset === suffix.length
	// }

	removeFromStartUntil = (until: string, alsoRemoveUntilStr: boolean) => {
		const index = this.originalS.indexOf(until, this.i)

		if (index === -1) {
			this.i = this.j + 1
			return null
		}
		// console.log('index', index, until.length)

		if (alsoRemoveUntilStr)
			this.i = index + until.length
		else
			this.i = index

		return true
	}


	removeCodeBlock = () => {
		// Match either:
		// 1. ```language\n<code>\n```\n?
		// 2. ```<code>\n```\n?

		const pm = this
		const foundCodeBlock = pm.removePrefix('```')
		if (!foundCodeBlock) return false

		pm.removeFromStartUntil('\n', true) // language

		const j = pm.j
		let foundCodeBlockEnd = pm.removeSuffix('```')

		if (pm.j === j) foundCodeBlockEnd = pm.removeSuffix('```\n') // if no change, try again with \n after ```

		if (!foundCodeBlockEnd) return false

		pm.removeSuffix('\n') // remove the newline before ```
		return true
	}


	deltaInfo = (recentlyAddedTextLen: number) => {
		// aaaaaatextaaaaaa{recentlyAdded}
		//                  ^   i    j    len
		//                  |
		//            recentyAddedIdx
		const recentlyAddedIdx = this.originalS.length - recentlyAddedTextLen
		const actualDelta = this.originalS.substring(Math.max(this.i, recentlyAddedIdx), this.j + 1)
		const ignoredSuffix = this.originalS.substring(Math.max(this.j + 1, recentlyAddedIdx), Infinity)
		return [actualDelta, ignoredSuffix] as const
	}



}



export const extractCodeFromRegular = ({ text, recentlyAddedTextLen }: { text: string, recentlyAddedTextLen: number }): [string, string, string] => {

	const pm = new SurroundingsRemover(text)

	pm.removeCodeBlock()

	const s = pm.value()
	const [delta, ignoredSuffix] = pm.deltaInfo(recentlyAddedTextLen)

	return [s, delta, ignoredSuffix]
}





// Ollama has its own FIM, we should not use this if we use that
export const extractCodeFromFIM = ({ text, recentlyAddedTextLen, midTag, }: { text: string, recentlyAddedTextLen: number, midTag: string }): [string, string, string] => {

	/* ------------- summary of the regex -------------
		[optional ` | `` | ```]
		(match optional_language_name)
		[optional strings here]
		[required <MID> tag]
		(match the stuff between mid tags)
		[optional <MID/> tag]
		[optional ` | `` | ```]
	*/

	const pm = new SurroundingsRemover(text)

	pm.removeCodeBlock()

	const foundMid = pm.removePrefix(`<${midTag}>`)

	if (foundMid) {
		pm.removeSuffix(`</${midTag}>`)
	}
	const s = pm.value()
	const [delta, ignoredSuffix] = pm.deltaInfo(recentlyAddedTextLen)

	return [s, delta, ignoredSuffix]


	// // const regex = /[\s\S]*?(?:`{1,3}\s*([a-zA-Z_]+[\w]*)?[\s\S]*?)?<MID>([\s\S]*?)(?:<\/MID>|`{1,3}|$)/;
	// const regex = new RegExp(
	// 	`[\\s\\S]*?(?:\`{1,3}\\s*([a-zA-Z_]+[\\w]*)?[\\s\\S]*?)?<${midTag}>([\\s\\S]*?)(?:</${midTag}>|\`{1,3}|$)`,
	// 	''
	// );
	// const match = text.match(regex);
	// if (match) {
	// 	const [_, languageName, codeBetweenMidTags] = match;
	// 	return [languageName, codeBetweenMidTags] as const

	// } else {
	// 	return [undefined, extractCodeFromRegular(text)] as const
	// }

}




export type ExtractedSearchReplaceBlock = {
	state: 'writingOriginal' | 'writingFinal' | 'done',
	orig: string,
	final: string,
}


const endsWithAnyPrefixOf = (str: string, anyPrefix: string) => {
	// for each prefix
	for (let i = anyPrefix.length; i >= 0; i--) {
		const prefix = anyPrefix.slice(0, i)
		if (str.endsWith(prefix)) return prefix
	}
	return null
}

// guarantees if you keep adding text, array length will strictly grow and state will progress without going back
export const extractSearchReplaceBlocks = (str: string) => {

	const ORIGINAL_ = ORIGINAL + `\n`
	const DIVIDER_ = '\n' + DIVIDER + `\n`
	const FINAL_ = '\n' + FINAL


	const blocks: ExtractedSearchReplaceBlock[] = []

	let i = 0 // search i and beyond (this is done by plain index, not by line number. much simpler this way)
	while (true) {
		let origStart = str.indexOf(ORIGINAL_, i)
		if (origStart === -1) { return blocks }
		origStart += ORIGINAL_.length
		i = origStart
		// wrote <<<< ORIGINAL

		let dividerStart = str.indexOf(DIVIDER_, i)
		if (dividerStart === -1) { // if didnt find DIVIDER_, either writing originalStr or DIVIDER_ right now
			const isWritingDIVIDER = endsWithAnyPrefixOf(str, DIVIDER_)
			blocks.push({
				orig: str.substring(origStart, str.length - (isWritingDIVIDER?.length ?? 0)),
				final: '',
				state: 'writingOriginal'
			})
			return blocks
		}
		const origStrDone = str.substring(origStart, dividerStart)
		dividerStart += DIVIDER_.length
		i = dividerStart
		// wrote =====

		let finalStart = str.indexOf(FINAL_, i)
		if (finalStart === -1) { // if didnt find FINAL_, either writing finalStr or FINAL_ right now
			const isWritingFINAL = endsWithAnyPrefixOf(str, FINAL_)
			blocks.push({
				orig: origStrDone,
				final: str.substring(dividerStart, str.length - (isWritingFINAL?.length ?? 0)),
				state: 'writingFinal'
			})
			return blocks
		}
		const finalStrDone = str.substring(dividerStart, finalStart)
		finalStart += FINAL_.length
		i = finalStart
		// wrote >>>>> FINAL

		blocks.push({
			orig: origStrDone,
			final: finalStrDone,
			state: 'done'
		})
	}
}
