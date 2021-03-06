import { BlueprintManifestType, SomeBlueprintManifest } from 'tv-automation-sofie-blueprints-integration'
import { literal, protectString } from '../../../../lib/lib'
import { Blueprint } from '../../../../lib/collections/Blueprints'

export function generateFakeBlueprint(id: string, type?: BlueprintManifestType, codeFcn?: () => SomeBlueprintManifest) {
	const codeFcnString = codeFcn
		? codeFcn.toString()
		: `\
() => ({
  blueprintType: ${type ? `"${type}"` : 'undefined'},
  blueprintVersion: '0.0.0',
  integrationVersion: '0.0.0',
  TSRVersion: '0.0.0',
  minimumCoreVersion: '0.0.0',
  studioConfigManifest: [],
  studioMigrations: [],
  getBaseline: () => [],
  getShowStyleId: () => null
})`

	return literal<Blueprint>({
		_id: protectString(id),
		name: 'Fake blueprint',
		organizationId: null,
		code: `({default: (${codeFcnString})()})`,
		created: 0,
		modified: 0,

		blueprintId: protectString(''),
		blueprintType: type,

		studioConfigManifest: [],
		showStyleConfigManifest: [],

		databaseVersion: {
			showStyle: {},
			studio: {},
		},

		blueprintVersion: '',
		integrationVersion: '',
		TSRVersion: '',
		minimumCoreVersion: '',
	})
}
