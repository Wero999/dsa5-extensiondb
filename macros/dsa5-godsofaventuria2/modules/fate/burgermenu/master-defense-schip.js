import { DSA5GodsMenuConfig } from '../config.js';
import { registerMasterSchipBurgerMenu } from './base-schip-menu.js';

const EFFECT_FLAG = 'masterDefense';

function hasMasterDefenseEffect(actor) {
    return actor.effects.some(
        (effect) => !effect.disabled && effect.getFlag(DSA5GodsMenuConfig.MODULE_ID, EFFECT_FLAG),
    );
}

registerMasterSchipBurgerMenu({
    hookKey: 'dsa5-gods.master-defense-schip',
    labelKey: 'GodsMenu.FateTab.MasterDefenseSchipName',
    alreadyActiveKey: 'GodsMenu.FateTab.MasterDefenseSchipAlreadyActive',
    matches: ({ testData }) => testData?.mode === 'parry'
        || testData?.mode === 'dodge'
        || testData?.source?.type === 'dodge',
    isApplied: (rule, { dialog, actor }) => hasMasterDefenseEffect(actor)
        || rule.hasModifierApplied(dialog, _loc('GodsMenu.FateTab.MasterDefenseSchipMod')),
    getRollDetails: ({ actor }) => `<p><b>${foundry.utils.escapeHTML(actor.name)}</b>: ${_loc('GodsMenu.FateTab.MasterDefenseSchipDesc')}</p>`,
    apply: async (rule, { dialog, actor }) => {
        const modName = _loc('GodsMenu.FateTab.MasterDefenseSchipMod');

        await actor.createEmbeddedDocuments('ActiveEffect', [{
            name: modName,
            img: 'systems/dsa5/icons/meisterschip.webp',
            description: _loc('GodsMenu.FateTab.MasterDefenseSchipDesc'),
            duration: { rounds: 5 },
            changes: [
                { key: 'system.meleeStats.parry', type: 'add', value: 4 },
                { key: 'system.status.dodge.gearmodifier', type: 'add', value: 4 },
            ],
            flags: {
                [DSA5GodsMenuConfig.MODULE_ID]: { [EFFECT_FLAG]: true },
            },
        }]);

        if (!dialog.rendered) return;

        rule.upsertModifier(dialog, {
            name: modName,
            value: 4,
            selected: true,
            source: _loc('GodsMenu.FateTab.MasterDefenseSchipSource'),
        });

        rule.getSituationalModifiersWidget(dialog)?.dispatchChange();
    },
});
