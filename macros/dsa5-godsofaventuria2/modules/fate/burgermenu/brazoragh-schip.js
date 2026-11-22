import { DSA5GodsMenuConfig } from '../config.js';
import { triggerStandaloneSpecialSchip } from '../fate-actions.js';

const BRAZORAGH_SCHIP_HOOK_KEY = 'dsa5-gods.brazoragh-schip';
const pendingDialogs = new WeakSet();
const blockedDialogs = new WeakSet();

function registerBrazoraghSchipHooks() {
    class BrazoraghSchipBurgerMenu extends game.dsa5.api.RollDialogBurgerMenuRule {
        constructor() {
            super({ abilityNameKey: 'God.Brazoragh.Name' });
        }

        matches(dialogState) {
            const { testData, actor } = dialogState;
            if (testData?.mode !== 'attack' || !actor) return false;

            const currentBrazoraghSchips = foundry.utils.getProperty(actor, 'flags.dsa5.specialPoints.Brazoragh.current') || 0;
            return currentBrazoraghSchips > 0;
        }

        getBurgerMenuItems(dialogState) {
            const iconPath = DSA5GodsMenuConfig.chipIcon('Brazoragh');
            return [{
                label: _loc('GodsMenu.BrazoraghSchipName'),
                icon: `<i class="schip tiny fullSchip" style="background-image: url('${iconPath}'); display: inline-block !important; vertical-align: middle !important; margin-right: 8px; border: none; box-shadow: none;"></i>`,
                onClick: async () => {
                    const { dialog, actor } = dialogState;
                    if (pendingDialogs.has(dialog)) return;

                    const modNameAT = _loc('GodsMenu.BrazoraghSchipNameAT');

                    if (this.hasModifierApplied(dialog, modNameAT)) {
                        ui.notifications.warn(_loc('GodsMenu.BrazoraghSchipAlreadyActive'));
                        return;
                    }
                    if (blockedDialogs.has(dialog)) {
                        ui.notifications.warn(_loc('GodsMenu.FateTab.SpecialRollBlockedTitle'));
                        return;
                    }

                    pendingDialogs.add(dialog);
                    try {
                        const result = await triggerStandaloneSpecialSchip({
                            actor,
                            key: 'Brazoragh',
                            actionLabel: _loc('GodsMenu.BrazoraghSchipName'),
                            rollDetails: `<p>${modNameAT}</p>`,
                        });

                        if (result.blocked) {
                            blockedDialogs.add(dialog);
                            return;
                        }
                        if (!result.executed || !dialog.rendered) return;

                        const widget = this.getSituationalModifiersWidget(dialog);
                        if (widget) {
                            const ignoredConditions = new Set([
                                _loc('CONDITION.inpain'),
                                _loc('CONDITION.feared'),
                            ]);
                            widget.removeModifier((mod) => ignoredConditions.has(mod.name));
                        }

                        this.upsertModifier(dialog, {
                            name: modNameAT,
                            value: 2,
                            selected: true,
                            source: _loc('GodsMenu.BrazoraghSchipSource'),
                        });

                        widget?.dispatchChange();
                    } finally {
                        pendingDialogs.delete(dialog);
                    }
                },
            }];
        }
    }

    const brazoraghSchipMenu = new BrazoraghSchipBurgerMenu();

    Hooks.on('dsa5.getRollDialogContextOptions', (dialogState, menuItems) => {
        if (brazoraghSchipMenu.matches(dialogState)) {
            menuItems.push(...brazoraghSchipMenu.getBurgerMenuItems(dialogState));
        }
    });
}

Hooks.once('setup', () => {
    const hookRegistry = game.dsa5.dsa5HookRegistry;
    if (hookRegistry?.has(BRAZORAGH_SCHIP_HOOK_KEY)) return;

    hookRegistry?.add(BRAZORAGH_SCHIP_HOOK_KEY);
    registerBrazoraghSchipHooks();
});
