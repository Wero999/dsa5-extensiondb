import { DSA5GodsMenuConfig } from '../config.js';
import { triggerStandaloneSpecialSchip, triggerStandaloneMasterSchip } from '../fate-actions.js';

export function registerSchipBurgerMenu({
    hookKey,
    key,
    abilityNameKey,
    labelKey,
    alreadyActiveKey,
    matches,
    isApplied,
    getRollDetails,
    apply,
}) {
    const pendingDialogs = new WeakSet();
    const blockedDialogs = new WeakSet();

    function registerHooks() {
        class SchipBurgerMenu extends game.dsa5.api.RollDialogBurgerMenuRule {
            constructor() {
                super({ abilityNameKey });
            }

            matches(dialogState) {
                const { actor } = dialogState;
                if (!actor || !matches(dialogState)) return false;
                return DSA5GodsMenuConfig.getSpecialSchip(actor, key).current > 0;
            }

            getBurgerMenuItems(dialogState) {
                return [{
                    label: _loc(labelKey),
                    icon: `<i class="schip tiny fullSchip gods-burger-schip-icon" style="${DSA5GodsMenuConfig.chipStyle(key)}"></i>`,
                    onClick: async () => {
                        const { dialog, actor } = dialogState;
                        if (pendingDialogs.has(dialog)) return;

                        if (isApplied(this, dialogState)) {
                            ui.notifications.warn(_loc(alreadyActiveKey));
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
                                key,
                                actionLabel: _loc(labelKey),
                                rollDetails: getRollDetails(dialogState),
                            });

                            if (result.blocked) {
                                blockedDialogs.add(dialog);
                                return;
                            }
                            if (!result.executed || !dialog.rendered) return;

                            await apply(this, dialogState);
                        } finally {
                            pendingDialogs.delete(dialog);
                        }
                    },
                }];
            }
        }

        const menu = new SchipBurgerMenu();

        Hooks.on('dsa5.getRollDialogContextOptions', (dialogState, menuItems) => {
            if (menu.matches(dialogState)) {
                menuItems.push(...menu.getBurgerMenuItems(dialogState));
            }
        });
    }

    Hooks.once('setup', () => {
        const hookRegistry = game.dsa5.dsa5HookRegistry;
        if (hookRegistry?.has(hookKey)) return;

        hookRegistry?.add(hookKey);
        registerHooks();
    });
}

export function registerMasterSchipBurgerMenu({
    hookKey,
    labelKey,
    alreadyActiveKey,
    cost = 1,
    matches,
    isApplied,
    getRollDetails,
    apply,
}) {
    const pendingDialogs = new WeakSet();

    function registerHooks() {
        class MasterSchipBurgerMenu extends game.dsa5.api.RollDialogBurgerMenuRule {
            constructor() {
                super({ abilityNameKey: labelKey });
            }

            matches(dialogState) {
                if (!game.user.isGM || !dialogState.actor || !matches(dialogState)) return false;
                return DSA5GodsMenuConfig.getSchipSetting('masterschips').current >= cost;
            }

            getBurgerMenuItems(dialogState) {
                return [{
                    label: _loc(labelKey),
                    icon: '<i class="schip tiny fullSchip master-schip-bg gods-burger-schip-icon" style="background-image: url(\'systems/dsa5/icons/meisterschip.webp\');"></i>',
                    onClick: async () => {
                        const { dialog, actor } = dialogState;
                        if (pendingDialogs.has(dialog)) return;

                        if (isApplied(this, dialogState)) {
                            ui.notifications.warn(_loc(alreadyActiveKey));
                            return;
                        }

                        pendingDialogs.add(dialog);
                        try {
                            const result = await triggerStandaloneMasterSchip({
                                actor,
                                actionLabel: _loc(labelKey),
                                rollDetails: getRollDetails(dialogState),
                                amount: cost,
                            });
                            if (!result.executed) return;

                            await apply(this, dialogState);
                        } finally {
                            pendingDialogs.delete(dialog);
                        }
                    },
                }];
            }
        }

        const menu = new MasterSchipBurgerMenu();

        Hooks.on('dsa5.getRollDialogContextOptions', (dialogState, menuItems) => {
            if (menu.matches(dialogState)) {
                menuItems.push(...menu.getBurgerMenuItems(dialogState));
            }
        });
    }

    Hooks.once('setup', () => {
        const hookRegistry = game.dsa5.dsa5HookRegistry;
        if (hookRegistry?.has(hookKey)) return;

        hookRegistry?.add(hookKey);
        registerHooks();
    });
}
