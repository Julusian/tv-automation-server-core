import * as _ from 'underscore'
import * as Velocity from 'velocity-animate'

import { SEGMENT_TIMELINE_ELEMENT_ID } from '../ui/SegmentTimeline/SegmentTimeline'
import { Parts, PartId } from '../../lib/collections/Parts'
import { PartInstances, PartInstanceId } from '../../lib/collections/PartInstances'
import { SegmentId } from '../../lib/collections/Segments'
import { isProtectedString } from '../../lib/lib'
import { RundownViewEvents, IGoToPartEvent, IGoToPartInstanceEvent } from '../ui/RundownView'

let focusInterval: NodeJS.Timer | undefined
let _dontClearInterval: boolean = false

export function maintainFocusOnPartInstance(
	partInstanceId: PartInstanceId,
	timeWindow: number,
	forceScroll?: boolean,
	noAnimation?: boolean
) {
	let startTime = Date.now()
	const focus = () => {
		if (Date.now() - startTime < timeWindow) {
			_dontClearInterval = true
			scrollToPartInstance(partInstanceId, forceScroll, noAnimation)
				.then(() => {
					_dontClearInterval = false
				})
				.catch(() => {
					_dontClearInterval = false
				})
		} else {
			quitFocusOnPart()
		}
	}
	focusInterval = setInterval(focus, 500)
	focus()
}

export function isMaintainingFocus(): boolean {
	return !!focusInterval
}

function quitFocusOnPart() {
	if (!_dontClearInterval && focusInterval) {
		clearInterval(focusInterval)
		focusInterval = undefined
	}
}

export function scrollToPartInstance(
	partInstanceId: PartInstanceId,
	forceScroll?: boolean,
	noAnimation?: boolean
): Promise<boolean> {
	quitFocusOnPart()
	const partInstance = PartInstances.findOne(partInstanceId)
	if (partInstance) {
		window.dispatchEvent(
			new CustomEvent<IGoToPartInstanceEvent>(RundownViewEvents.goToPart, {
				detail: {
					segmentId: partInstance.segmentId,
					partInstanceId: partInstanceId,
				},
			})
		)
		return scrollToSegment(partInstance.segmentId, forceScroll, noAnimation)
	}
	return Promise.reject('Could not find PartInstance')
}

export async function scrollToPart(partId: PartId, forceScroll?: boolean, noAnimation?: boolean): Promise<boolean> {
	quitFocusOnPart()
	let part = Parts.findOne(partId)
	if (part) {
		await scrollToSegment(part.segmentId, forceScroll, noAnimation)

		window.dispatchEvent(
			new CustomEvent<IGoToPartEvent>(RundownViewEvents.goToPart, {
				detail: {
					segmentId: part.segmentId,
					partId: partId,
				},
			})
		)

		return true // rather meaningless as we don't know what happened
	}
	return Promise.reject('Could not find part')
}

const FALLBACK_HEADER_HEIGHT = 65
let HEADER_HEIGHT: number | undefined = undefined
export const HEADER_MARGIN = 24

export function getHeaderHeight(): number {
	if (HEADER_HEIGHT === undefined) {
		const root = document.querySelector('#render-target > .container-fluid > .rundown-view > .header')
		if (!root) {
			return FALLBACK_HEADER_HEIGHT
		}
		const { height } = root.getBoundingClientRect()
		HEADER_HEIGHT = height
	}
	return HEADER_HEIGHT
}

let pendingSecondStageScroll: number | undefined
let currentScrollingElement: HTMLElement | undefined

export function scrollToSegment(
	elementToScrollToOrSegmentId: HTMLElement | SegmentId,
	forceScroll?: boolean,
	noAnimation?: boolean,
	secondStage?: boolean
): Promise<boolean> {
	let elementToScrollTo: HTMLElement | null = isProtectedString(elementToScrollToOrSegmentId)
		? document.querySelector('#' + SEGMENT_TIMELINE_ELEMENT_ID + elementToScrollToOrSegmentId)
		: elementToScrollToOrSegmentId

	if (!elementToScrollTo) {
		return Promise.reject('Could not find segment element')
	}

	if (!secondStage) {
		currentScrollingElement = elementToScrollTo
	} else if (secondStage && elementToScrollTo !== currentScrollingElement) {
		return Promise.reject('Scroll overriden by another scroll')
	}

	let { top, bottom } = elementToScrollTo.getBoundingClientRect()
	top = Math.floor(top)
	bottom = Math.floor(bottom)

	const headerHeight = Math.floor(getHeaderHeight())

	// check if the item is in viewport
	if (forceScroll || bottom > Math.floor(window.innerHeight) || top < headerHeight) {
		if (pendingSecondStageScroll) window.cancelIdleCallback(pendingSecondStageScroll)

		return scrollToPosition(top + window.scrollY, noAnimation).then(
			() => {
				// retry scroll in case we have to load some data
				if (pendingSecondStageScroll) window.cancelIdleCallback(pendingSecondStageScroll)
				return new Promise<boolean>((resolve, reject) => {
					// scrollToPosition will resolve after some time, at which point a new pendingSecondStageScroll may have been created

					pendingSecondStageScroll = window.requestIdleCallback(
						() => {
							let { top, bottom } = elementToScrollTo!.getBoundingClientRect()
							top = Math.floor(top)
							bottom = Math.floor(bottom)

							if (!secondStage) {
								let { top, bottom } = elementToScrollTo!.getBoundingClientRect()
								top = Math.floor(top)
								bottom = Math.floor(bottom)

								if (bottom > Math.floor(window.innerHeight) || top < headerHeight) {
									return scrollToSegment(elementToScrollToOrSegmentId, forceScroll, true, true).then(
										resolve,
										reject
									)
								} else {
									resolve(true)
								}
							} else {
								currentScrollingElement = undefined
								resolve(true)
							}
						},
						{ timeout: 250 }
					)
				})
			},
			(error) => {
				if (!error.toString().match(/another scroll/)) console.error(error)
				return false
			}
		)
	}

	return Promise.resolve(false)
}

let scrollToPositionRequest: number | undefined
let scrollToPositionRequestReject: ((reason?: any) => void) | undefined

export function scrollToPosition(scrollPosition: number, noAnimation?: boolean): Promise<void> {
	if (noAnimation) {
		return new Promise((resolve, reject) => {
			window.scroll({
				top: Math.max(0, scrollPosition - getHeaderHeight() - HEADER_MARGIN),
				left: 0,
			})
			resolve()
		})
	} else {
		return new Promise((resolve, reject) => {
			if (scrollToPositionRequest !== undefined) window.cancelIdleCallback(scrollToPositionRequest)
			if (scrollToPositionRequestReject !== undefined)
				scrollToPositionRequestReject('Prevented by another scroll')

			scrollToPositionRequestReject = reject
			scrollToPositionRequest = window.requestIdleCallback(
				() => {
					window.scroll({
						top: Math.max(0, scrollPosition - getHeaderHeight() - HEADER_MARGIN),
						left: 0,
						behavior: 'smooth',
					})
					setTimeout(() => {
						resolve()
						scrollToPositionRequestReject = undefined
					}, 3000)
				},
				{ timeout: 250 }
			)
		})
	}
}

let pointerLockTurnstile = 0
let pointerHandlerAttached = false

function pointerLockChange(e: Event): void {
	if (!document.pointerLockElement) {
		// noOp, if the pointer is unlocked, good. That's a safe position
	} else {
		// if a pointer has been locked, check if it should be. We might have already
		// changed our mind
		if (pointerLockTurnstile <= 0) {
			// this means that the we've received an equal amount of locks and unlocks (or even more unlocks)
			// we should request an exit from the pointer lock
			pointerLockTurnstile = 0
			document.exitPointerLock()
		}
	}
}

function pointerLockError(e: Event): void {
	console.log('Pointer lock error', e)
	pointerLockTurnstile = 0
}

export function lockPointer(): void {
	if (pointerLockTurnstile === 0) {
		// pointerLockTurnstile === 0 means that no requests for locking the pointer have been made
		// since we last unlocked it
		document.body.requestPointerLock()
		// attach the event handlers only once. Once they are attached, we will track the
		// locked state and act according to the turnstile
		if (!pointerHandlerAttached) {
			pointerHandlerAttached = true
			document.addEventListener('pointerlockchange', pointerLockChange)
			document.addEventListener('pointerlockerror', pointerLockError)
		}
	}
	// regardless of any other state, modify the turnstile so that we can track locks/unlocks
	pointerLockTurnstile++
}

export function unlockPointer(): void {
	// request and exit, but bear in mind that this might not actually
	// cause an exit, for timing reasons, so lets modify the turnstile
	// to be able to act, once the lock is confirmed
	document.exitPointerLock()
	pointerLockTurnstile--
}
