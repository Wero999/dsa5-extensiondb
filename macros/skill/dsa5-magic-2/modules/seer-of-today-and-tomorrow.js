Hooks.on('dsa5.getRollDialogContextOptions', (dialogState, menuItems) => {
    const { source, actor, dialog } = dialogState;
    if (!source || !["spell", "ritual"].includes(source.type) || !actor) return;

    const uneigennuetzigName = game.i18n.localize("LocalizedIDs.selfless");
    const hellsichtName = game.i18n.localize("Features.Clairvoyance");
    const isHellsicht = (source.system.feature || "").includes(hellsichtName);

    const widget = dialog?.element?.querySelector?.('[is="dsa-situationalmodifiers"]');
    if (!widget) return;

    const targets = Array.from(game.user.targets);
    const isSelfTarget = targets.length === 0 || targets.some(t => t.actor?.id === actor.id);

    if (isHellsicht) {
        const hasMod = Array.from(widget.querySelectorAll('option')).some(opt => opt.text.includes(uneigennuetzigName));
        if (hasMod) {
            widget.removeModifier(mod => mod.name && mod.name.includes(uneigennuetzigName));
            widget.dispatchChange();
        }
    } else {
        const select = widget.querySelector('select');
        const option = Array.from(select.options).find(opt => opt.text.includes(uneigennuetzigName));
        
        if (option && option.selected !== isSelfTarget) {
            option.selected = isSelfTarget;
            widget.dispatchChange();
        }
    }
});
