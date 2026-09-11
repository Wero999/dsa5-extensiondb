const KOR_SCHIP_HOOK_KEY = 'dsa5-gods.kor-schip';

function registerKorSchipHooks() {
    class KorSchipBurgerMenu extends game.dsa5.api.RollDialogBurgerMenuRule {
        constructor() {
            super({ abilityNameKey: 'God.Kor.Name' }); 
        }

        matches(dialogState) {
            const isAttack = dialogState?.testData?.mode === 'attack';
            if (!isAttack) return false;

            const actor = dialogState?.actor;
            if (!actor) return false;

            const currentKorSchips = foundry.utils.getProperty(actor, "flags.dsa5.specialPoints.Kor.current") || 0;
            return currentKorSchips > 0;
        }

        getBurgerMenuItems(dialogState) {
            return [{
                label: game.i18n.localize("GodsMenu.KorSchipName"), 
                icon: '<i class="schip tiny fullSchip" style="background-image: url(\'modules/dsa5-godsofaventuria2/icons/chips/Kor.webp\'); display: inline-block !important; vertical-align: middle !important; margin-right: 8px; border: none; box-shadow: none;"></i>',
                onClick: async () => {
                    const modNameAT = game.i18n.localize("GodsMenu.KorSchipNameAT");
                    const modNameTP = game.i18n.localize("GodsMenu.KorSchipNameTP");

                    if (this.hasModifierApplied(dialogState.dialog, modNameAT) || this.hasModifierApplied(dialogState.dialog, modNameTP)) {
                        ui.notifications.warn(game.i18n.localize("GodsMenu.KorSchipAlreadyActive"));
                        return;
                    }

                    const sourceText = game.i18n.localize("GodsMenu.KorSchipSource");

                    this.upsertModifier(dialogState.dialog, {
                        name: modNameAT,
                        value: 2,
                        selected: true,
                        source: sourceText
                    });

                    this.upsertModifier(dialogState.dialog, {
                        name: modNameTP,
                        value: 2,
                        type: 'dmg', 
                        selected: true,
                        source: sourceText
                    });

                    const widget = this.getSituationalModifiersWidget(dialogState.dialog);
                    if (widget && typeof widget.dispatchChange === 'function') {
                        widget.dispatchChange();
                    }
                }
            }];
        }
    }

    const korSchipMenu = new KorSchipBurgerMenu();

    Hooks.on('dsa5.getRollDialogContextOptions', (dialogState, menuItems) => {
        if (!korSchipMenu.matches(dialogState)) return;
        menuItems.push(...korSchipMenu.getBurgerMenuItems(dialogState));
    });

    Hooks.on("postProcessDSARoll", async (chatOptions, testData, rerenderMessage, hideDamage) => {
        const preData = testData.preData;
        if (!preData) return;

        const modNameAT = game.i18n.localize("GodsMenu.KorSchipNameAT");
        const modNameTP = game.i18n.localize("GodsMenu.KorSchipNameTP");

        const hasModifier = preData.situationalModifiers?.some(mod =>
            mod.name === modNameAT || mod.name === modNameTP
        );

        if (hasModifier) {
            const speaker = preData.extra?.speaker || chatOptions.speaker;
            let actor = game.actors.get(speaker?.actor);

            if (!actor && speaker?.token && canvas.ready) {
                actor = canvas.tokens.get(speaker.token)?.actor;
            }

            if (actor) {
                const currentKor = foundry.utils.getProperty(actor, "flags.dsa5.specialPoints.Kor.current") || 0;
                if (currentKor > 0) {
                    await actor.update({ "flags.dsa5.specialPoints.Kor.current": currentKor - 1 });
                    ui.notifications.info(game.i18n.format("GodsMenu.KorSchipConsumed", { name: actor.name }));
                }
            }
        }
    });
}

Hooks.once("setup", function () {
    const hookRegistry = game.dsa5.dsa5HookRegistry;
    if (hookRegistry?.has(KOR_SCHIP_HOOK_KEY)) return;

    hookRegistry?.add(KOR_SCHIP_HOOK_KEY);
    registerKorSchipHooks();
});
