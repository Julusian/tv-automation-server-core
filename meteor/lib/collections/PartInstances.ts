import * as _ from 'underscore'
import { TransformedCollection, MongoSelector, FindOptions } from '../typings/meteor'
import { applyClassToDocument, Time, registerCollection } from '../lib'
import { Meteor } from 'meteor/meteor'
import {
	IBlueprintPartInstance,
	BlueprintRuntimeArguments,
	PartEndState,
} from 'tv-automation-sofie-blueprints-integration'
import { createMongoCollection } from './lib'
import { DBPart, Part } from './Parts'
import { PieceInstance, PieceInstances } from './PieceInstances'
import { Pieces } from './Pieces'

export interface DBPartInstance extends IBlueprintPartInstance {
	rundownId: string

	/** Rank of the take that this PartInstance belongs to */
	takeCount: number

	part: DBPart
}

export class PartInstance implements DBPartInstance {
	/** Whether this PartInstance is a temprorary wrapping of a Part */
	public readonly isTemporary: boolean

	public takeCount: number

	/** Temporarily track whether this PartInstance has been taken, so we can easily find and prune those which are only nexted */
	public isTaken?: boolean

	// From IBlueprintPartInstance:
	public part: Part
	public _id: string
	public segmentId: string
	public rundownId: string

	constructor (document: DBPartInstance, isTemporary?: boolean) {
		_.each(_.keys(document), (key) => {
			this[key] = document[key]
		})
		this.isTemporary = isTemporary === true
		this.part = new Part(document.part)
	}
	getPieceInstances (selector?: MongoSelector<PieceInstance>, options?: FindOptions) {
		if (this.isTemporary) {
			throw new Error('Not implemented') // TODO?
			// const pieces = Pieces.find(
			// 	{
			// 		...selector,
			// 		rundownId: this.rundownId,
			// 		partId: this._id
			// 	},
			// 	{
			// 		sort: { _rank: 1 },
			// 		...options
			// 	}
			// ).fetch()
		} else {
			return PieceInstances.find(
				{
					...selector,
					rundownId: this.rundownId,
					partId: this._id
				},
				{
					sort: { _rank: 1 },
					...options
				}
			).fetch()
		}
	}
	getAllPieceInstances () {
		return this.getPieceInstances()
	}

}

export function WrapPartToTemporaryInstance (part: DBPart): PartInstance {
	return new PartInstance({
		_id: `${part._id}_tmp_instance`,
		rundownId: part.rundownId,
		segmentId: part.segmentId,
		takeCount: -1, // TODO - is this any good?
		part: new Part(part)
	}, true)
}

export function FindPartInstanceOrWrapToTemporary (partInstances: PartInstance[], part: DBPart): PartInstance {
	return partInstances.find(instance => instance.part._id === part._id) || WrapPartToTemporaryInstance(part)
}

export const PartInstances: TransformedCollection<PartInstance, DBPartInstance> = createMongoCollection<PartInstance>('partInstances', { transform: (doc) => applyClassToDocument(PartInstance, doc) })
registerCollection('PartInstances', PartInstances)
Meteor.startup(() => {
	if (Meteor.isServer) {
		PartInstances._ensureIndex({
			rundownId: 1,
			segmentId: 1,
			takeCount: 1
		})
		PartInstances._ensureIndex({
			rundownId: 1,
			takeCount: 1
		})
		PartInstances._ensureIndex({
			rundownId: 1,
			partId: 1,
			takeCount: 1
		})
	}
})
