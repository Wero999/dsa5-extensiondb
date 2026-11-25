import { registerSchipBurgerMenu } from './base-schip-menu.js';

registerSchipBurgerMenu({
    hookKey: 'dsa5-gods.kor-schip',
    key: 'Kor',
    abilityNameKey: 'God.Kor.Name',
    labelKey: 'GodsMenu.KorSchipName',
    alreadyActiveKey: 'GodsMenu.KorSchipAlreadyActive',
    matches: ({ testData }) => testData?.mode === 'attack',
    isApplied: (rule, { dialog }) => rule.hasModifierApplied(dialog, _loc('GodsMenu.KorSchipNameAT'))
        || rule.hasModifierApplied(dialog, _loc('GodsMenu.KorSchipNameTP')),
    getRollDetails: () => `<p>${_loc('GodsMenu.KorSchipNameAT')}, ${_loc('GodsMenu.KorSchipNameTP')}</p>`,
    apply: (rule, { dialog }) => {
        const source = _loc('GodsMenu.KorSchipSource');

        rule.upsertModifier(dialog, {
            name: _loc('GodsMenu.KorSchipNameAT'),
            value: 2,
            selected: true,
            source,
        });

        rule.upsertModifier(dialog, {
            name: _loc('GodsMenu.KorSchipNameTP'),
            value: 2,
            type: 'dmg',
            selected: true,
            source,
        });

        rule.getSituationalModifiersWidget(dialog)?.dispatchChange();
    },
});
