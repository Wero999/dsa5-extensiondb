export function getDemonConditionRemovals(specialKey) {
    let autoConditions = [];
    let manualRemovals = [];

    switch(specialKey) {
        case "Amazeroth":
        case "Heskatet": autoConditions.push("confusion"); break;
        case "Aphasmayra":
        case "Lolgramoth": autoConditions.push("paralyzed"); break;
        case "Aphestadil":
        case "Charyptoroth": autoConditions.push("stunned"); break;
        case "Belhalhar":
        case "Belkelel": autoConditions.push("inpain"); break;
        case "Blakharaz":
        case "Thargunitoth": autoConditions.push("feared"); break;
        case "Agrimoth": autoConditions.push("heat"); break;
        case "Nagrach": autoConditions.push("cold"); break;
        case "Mishkara": 
            autoConditions.push("sick", "poisoned"); 
            manualRemovals.push("3 beliebige Zustandsstufen"); break;
        case "Asfaloth":
        case "Tasfarel": 
            manualRemovals.push("3 beliebige Zustandsstufen"); break;
    }

    return { autoConditions, manualRemovals };
}

export async function applyDemonConditionRemovals(actor, autoConditions, manualReductions) {
    // Automatisch Zustände entfernen
    for (let cond of autoConditions) {
        const effect = actor.hasCondition(cond);
        if (effect) {
            const amount = effect.system?.condition?.value || effect.getFlag("dsa5", "value") || 1; 
            await actor.removeCondition(cond, amount, false);
            ui.notifications.info(game.i18n.format("FateTab.ConditionRemovedFull", { name: effect.name }));
        }
    }
    
    // Manuelle Reduzierungen
    if (Object.keys(manualReductions).length > 0) {
        for (let [id, amount] of Object.entries(manualReductions)) {
            if (amount > 0) {
                const effectName = actor.effects.find(e => Array.from(e.statuses).includes(id))?.name || id;
                await actor.removeCondition(id, amount, false);
                ui.notifications.info(game.i18n.format("FateTab.ConditionRemovedPartial", { name: effectName, amount: amount }));
            }
        }
    }
}
