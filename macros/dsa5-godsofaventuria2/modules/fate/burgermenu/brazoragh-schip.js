import { registerSchipBurgerMenu } from './base-schip-menu.js';

registerSchipBurgerMenu({
    hookKey: 'dsa5-gods.brazoragh-schip',
    key: 'Brazoragh',
    abilityNameKey: 'God.Brazoragh.Name',
    labelKey: 'GodsMenu.BrazoraghSchipName',
    alreadyActiveKey: 'GodsMenu.BrazoraghSchipAlreadyActive',
    matches: ({ testData }) => testData?.mode === 'attack',
    isApplied: (rule, { dialog }) => rule.hasModifierApplied(dialog, _loc('GodsMenu.BrazoraghSchipNameAT')),
    getRollDetails: () => `<p>${_loc('GodsMenu.BrazoraghSchipNameAT')}</p>`,
    apply: (rule, { dialog }) => {
        const widget = rule.getSituationalModifiersWidget(dialog);
        if (widget) {
            const ignoredConditions = new Set([
                _loc('CONDITION.inpain'),
                _loc('CONDITION.feared'),
            ]);
            widget.removeModifier((mod) => ignoredConditions.has(mod.name));
        }

        rule.upsertModifier(dialog, {
            name: _loc('GodsMenu.BrazoraghSchipNameAT'),
            value: 2,
            selected: true,
            source: _loc('GodsMenu.BrazoraghSchipSource'),
        });

        widget?.dispatchChange();
    },
});
