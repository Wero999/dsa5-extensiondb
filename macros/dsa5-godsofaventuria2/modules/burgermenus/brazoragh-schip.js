const BRAZORAGH_SCHIP_HOOK_KEY = 'dsa5-gods.brazoragh-schip';

function registerBrazoraghSchipHooks() {
    class BrazoraghSchipBurgerMenu extends game.dsa5.api.RollDialogBurgerMenuRule {
        constructor() {
            super({ abilityNameKey: 'God.Brazoragh.Name' }); 
        }

        matches(dialogState) {
            const isAttack = dialogState?.testData?.mode === 'attack';
            if (!isAttack) return false;

            const actor = dialogState?.actor;
            if (!actor) return false;

            const currentBrazoraghSchips = foundry.utils.getProperty(actor, "flags.dsa5.specialPoints.Brazoragh.current") || 0;
            return currentBrazoraghSchips > 0;
        }

        getBurgerMenuItems(dialogState) {
            return [{
                label: game.i18n.localize("GodsMenu.BrazoraghSchipName"), 
                icon: '<i class="schip tiny fullSchip" style="background-image: url(\'modules/dsa5-godsofaventuria2/icons/chips/Brazoragh.webp\'); display: inline-block !important; vertical-align: middle !important; margin-right: 8px; border: none; box-shadow: none;"></i>',
                onClick: async () => {
                    const modNameAT = game.i18n.localize("GodsMenu.BrazoraghSchipNameAT");

                    if (this.hasModifierApplied(dialogState.dialog, modNameAT)) {
                        ui.notifications.warn(game.i18n.localize("GodsMenu.BrazoraghSchipAlreadyActive"));
                        return;
                    }

                    const widget = this.getSituationalModifiersWidget(dialogState.dialog);
                    if (widget) {
                        const pain = game.i18n.localize("CONDITION.pain");
                        const fear = game.i18n.localize("CONDITION.fear");
                        
                        widget.removeModifier(mod => mod.name === pain || mod.name === fear);
                    }

                    const sourceText = game.i18n.localize("GodsMenu.BrazoraghSchipSource");

                    this.upsertModifier(dialogState.dialog, {
                        name: modNameAT,
                        value: 2,
                        selected: true,
                        source: sourceText
                    });

                    if (widget && typeof widget.dispatchChange === 'function') {
                        widget.dispatchChange();
                    }
                }
            }];
        }
    }

    const brazoraghSchipMenu = new BrazoraghSchipBurgerMenu();

    Hooks.on('dsa5.getRollDialogContextOptions', (dialogState, menuItems) => {
        if (!brazoraghSchipMenu.matches(dialogState)) return;
        menuItems.push(...brazoraghSchipMenu.getBurgerMenuItems(dialogState));
    });

    Hooks.on("postProcessDSARoll", async (chatOptions, testData, rerenderMessage, hideDamage) => {
        const preData = testData.preData;
        if (!preData) return;

        const modNameAT = game.i18n.localize("GodsMenu.BrazoraghSchipNameAT");

        const hasModifier = preData.situationalModifiers?.some(mod => mod.name === modNameAT);

        if (hasModifier) {
            const speaker = preData.extra?.speaker || chatOptions.speaker;
            let actor = game.actors.get(speaker?.actor);

            if (!actor && speaker?.token && canvas.ready) {
                actor = canvas.tokens.get(speaker.token)?.actor;
            }

            if (actor) {
                const currentBrazoragh = foundry.utils.getProperty(actor, "flags.dsa5.specialPoints.Brazoragh.current") || 0;
                if (currentBrazoragh > 0) {
                    await actor.update({ "flags.dsa5.specialPoints.Brazoragh.current": currentBrazoragh - 1 });
                    ui.notifications.info(game.i18n.format("GodsMenu.BrazoraghSchipConsumed", { name: actor.name }));
                }
            }
        }
    });
}

Hooks.once("setup", function () {
    const hookRegistry = game.dsa5.dsa5HookRegistry;
    if (hookRegistry?.has(BRAZORAGH_SCHIP_HOOK_KEY)) return;

    hookRegistry?.add(BRAZORAGH_SCHIP_HOOK_KEY);
    registerBrazoraghSchipHooks();
});
