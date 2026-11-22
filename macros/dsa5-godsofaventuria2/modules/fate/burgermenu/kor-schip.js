import { DSA5GodsMenuConfig } from '../config.js';
import { triggerStandaloneSpecialSchip } from '../fate-actions.js';

const KOR_SCHIP_HOOK_KEY = 'dsa5-gods.kor-schip';
const pendingDialogs = new WeakSet();
const blockedDialogs = new WeakSet();

function registerKorSchipHooks() {
    class KorSchipBurgerMenu extends game.dsa5.api.RollDialogBurgerMenuRule {
        constructor() {
            super({ abilityNameKey: 'God.Kor.Name' });
        }

        matches(dialogState) {
            const { testData, actor } = dialogState;
            if (testData?.mode !== 'attack' || !actor) return false;

            const currentKorSchips = foundry.utils.getProperty(actor, 'flags.dsa5.specialPoints.Kor.current') || 0;
            return currentKorSchips > 0;
        }

        getBurgerMenuItems(dialogState) {
            const iconPath = DSA5GodsMenuConfig.chipIcon('Kor');
            return [{
                label: _loc('GodsMenu.KorSchipName'),
                icon: `<i class="schip tiny fullSchip" style="background-image: url('${iconPath}'); display: inline-block !important; vertical-align: middle !important; margin-right: 8px; border: none; box-shadow: none;"></i>`,
                onClick: async () => {
                    const { dialog, actor } = dialogState;
                    if (pendingDialogs.has(dialog)) return;

                    const modNameAT = _loc('GodsMenu.KorSchipNameAT');
                    const modNameTP = _loc('GodsMenu.KorSchipNameTP');

                    if (this.hasModifierApplied(dialog, modNameAT) || this.hasModifierApplied(dialog, modNameTP)) {
                        ui.notifications.warn(_loc('GodsMenu.KorSchipAlreadyActive'));
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
                            key: 'Kor',
                            actionLabel: _loc('GodsMenu.KorSchipName'),
                            rollDetails: `<p>${modNameAT}, ${modNameTP}</p>`,
                        });

                        if (result.blocked) {
                            blockedDialogs.add(dialog);
                            return;
                        }
                        if (!result.executed || !dialog.rendered) return;

                        const sourceText = _loc('GodsMenu.KorSchipSource');

                        this.upsertModifier(dialog, {
                            name: modNameAT,
                            value: 2,
                            selected: true,
                            source: sourceText,
                        });

                        this.upsertModifier(dialog, {
                            name: modNameTP,
                            value: 2,
                            type: 'dmg',
                            selected: true,
                            source: sourceText,
                        });

                        this.getSituationalModifiersWidget(dialog)?.dispatchChange();
                    } finally {
                        pendingDialogs.delete(dialog);
                    }
                },
            }];
        }
    }

    const korSchipMenu = new KorSchipBurgerMenu();

    Hooks.on('dsa5.getRollDialogContextOptions', (dialogState, menuItems) => {
        if (korSchipMenu.matches(dialogState)) {
            menuItems.push(...korSchipMenu.getBurgerMenuItems(dialogState));
        }
    });
}

Hooks.once('setup', () => {
    const hookRegistry = game.dsa5.dsa5HookRegistry;
    if (hookRegistry?.has(KOR_SCHIP_HOOK_KEY)) return;

    hookRegistry?.add(KOR_SCHIP_HOOK_KEY);
    registerKorSchipHooks();
});
