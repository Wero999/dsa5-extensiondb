import DSA5_Utility from '/systems/dsa5/modules/system/helpers/utility-dsa5.js';
import { FateRolls } from '/systems/dsa5/modules/actor/concerns/faterolls.js';
import DiceDSA5 from '/systems/dsa5/modules/system/rolls/dice-dsa5.js';
import { DSA5GodsMenuConfig } from './config.js';
import { promptRerollCheat } from './fate-dialogs.js';

// Wurf-Reroll und Auswertung

export async function processReroll(diceIndices, testData, postData, rollContext, useMinimum = false, actor = null, isPhex = false, isCheat = false) {
    const rollFormulas = diceIndices.map(index => {
        const term = testData.roll.terms[index * 2];
        return `${term.number}d${term.faces}[${term.options.colorset}]`;
    });
    
    let newRoll = await new Roll(rollFormulas.join('+')).evaluate();
    
    if (isCheat) {
        const diceData = diceIndices.map((dieIndex, rollIndex) => {
            const charData = postData?.characteristics?.[dieIndex] || {};
            const term = testData.roll.terms[dieIndex * 2];
            const faces = term?.faces || 20;
            const original = charData.res || term?.results?.[0]?.result || 1;
            const attr = charData.char || 'd20';
            const cssClass = charData.suc ? 'suc' : (charData.suc === false ? 'fail' : '');
            
            let tooltip = "";
            if (charData.tar) {
                const locChar = game.i18n.localize(`CHARAbbrev.${attr.toUpperCase()}`);
                tooltip = `${locChar} vs ${charData.tar}`;
            }

            return { rollIndex, original, faces, attr, cssClass, tooltip };
        });

        const cheatResults = await promptRerollCheat(diceData);
        if (!cheatResults) return null;
        
        diceIndices.forEach((dieIndex, rollIndex) => {
            newRoll.terms[rollIndex * 2].results[0].result = cheatResults[rollIndex];
        });
        newRoll._total = newRoll.terms.reduce((acc, term) => acc + (term.total || 0), 0);
        newRoll = await DiceDSA5.manualRolls(newRoll, rollContext, { cheat: false });
    } else {
        newRoll = await DiceDSA5.manualRolls(newRoll, rollContext, { cheat: false });
    }
    
    await DiceDSA5.showDiceSoNice(newRoll, testData.messageMode || game.settings.get('core', 'rollMode'));
    
    const changedRollsHtml = [];
    const changedRollsText = [];
    const changes = [];
    
    if (!(testData.roll instanceof Roll)) {
        testData.roll = Roll.fromData(testData.roll);
    }
    
    diceIndices.forEach((dieIndex, rollIndex) => {
        const term = testData.roll.terms[dieIndex * 2];
        const newValue = newRoll.terms[rollIndex * 2].results[0].result;
        const originalValue = term.results[0].result;
        
        let charAttr = '';
        if (testData.source?.system?.[`characteristic${dieIndex + 1}`]?.value) {
            charAttr = testData.source.system[`characteristic${dieIndex + 1}`].value;
        } else if (testData.mode && !FateRolls.MULTI_DIE_ROLL_TYPES.includes(testData.mode)) {
            charAttr = testData.mode;
        }
        
        if (typeof FateRolls.formatDieChange === 'function') {
            const formatted = FateRolls.formatDieChange(originalValue, newValue, {
                char: charAttr,
                faces: term.faces,
            });
            changedRollsHtml.push(formatted.html);
            changedRollsText.push(formatted.text);
        } else {
            changedRollsText.push(`${originalValue}/${newValue}`);
        }
        
        let finalValue = newValue;
        if (useMinimum || isPhex) {
            finalValue = Math.min(newValue, originalValue);
        }
        changes.push({ index: dieIndex, val: finalValue });
    });
    
    testData.roll.editRollAtIndex(changes);
    return { newRoll, changedRollsHtml, changedRollsText, changes };
}

// Reroll (W20)
 
export async function executeReroll(app, data, newTestData, isCheat, isMasterReroll) {
    if (app.selectedForReroll.size === 0) {
        ui.notifications.warn(game.i18n.localize("ErrorNoDieSelected"));
        return null;
    }
    
    const isPhex = app.dsaActor.items.some(item => item.type === 'specialability' && item.name === game.i18n.localize('LocalizedIDs.traditionPhex'));
    
    const rerollData = await processReroll(
        Array.from(app.selectedForReroll).sort((a,b) => a - b),
        newTestData, data.postData, 'CHATCONTEXT.Reroll', false, app.dsaActor, isPhex, isCheat
    );
    
    if (!rerollData) return null;

    if (data.postData && data.postData.characteristics) {
        rerollData.changes.forEach(c => {
            const charObj = data.postData.characteristics[c.index];
            if (charObj) {
                charObj.res = c.val;
                if (charObj.tar !== undefined) {
                    charObj.suc = c.val <= charObj.tar;
                }
            }
        });
    }
    newTestData.fateUsed = true;
    
    const chatActionLabel = isMasterReroll ? game.i18n.localize("FateTab.MasterFate") : game.i18n.localize("FateTab.Reroll");
    let chatRollDetails = "";
    if (typeof FateRolls.formatDieChangesHtml === 'function') {
        chatRollDetails = FateRolls.formatDieChangesHtml(rerollData.changedRollsHtml);
    } else {
        chatRollDetails = `<p><b>${game.i18n.localize('Roll')}</b>: ${rerollData.changedRollsText.join(', ')}</p>`;
    }
    
    const flagToUpdate = isMasterReroll ? 'meisterSchicksalUsed' : FateRolls.FLAGS.FATE_REROLL;

    return { chatActionLabel, chatRollDetails, flagToUpdate };
}

// Schadenswurf wiederholen

export async function executeDamageReroll(app, data, newTestData, isCheat, isMasterDamageReroll) {
    if (app.selectedForDamageReroll.size === 0) {
        ui.notifications.warn(game.i18n.localize("ErrorNoDieSelected"));
        return null;
    }
    if (app.tabGroups.sheet === 'rerollDamage' && app.selectedForDamageReroll.size > 1) {
        ui.notifications.warn(game.i18n.localize("FateTab.ErrorMaxOneDie"));
        return null;
    }

    const origDamageData = data.postData.damageRoll || data.preData.damageRoll;
    const originalRoll = origDamageData instanceof Roll ? origDamageData : Roll.fromData(origDamageData);

    const selectedIndices = Array.from(app.selectedForDamageReroll).sort((a, b) => a - b);
    const rerollFormulas = [];
    const diceMapping = []; 
    
    let globalIndex = 0;
    for (let termIdx = 0; termIdx < originalRoll.terms.length; termIdx++) {
        const term = originalRoll.terms[termIdx];
        if (term.results) {
            for (let resIdx = 0; resIdx < term.results.length; resIdx++) {
                if (selectedIndices.includes(globalIndex)) {
                    rerollFormulas.push(`1d${term.faces}`);
                    diceMapping.push({ termIdx, resIdx, originalResult: term.results[resIdx].result });
                }
                globalIndex++;
            }
        }
    }

    let newRerollDie = await new Roll(rerollFormulas.join(' + ')).evaluate();
    newRerollDie = await DiceDSA5.manualRolls(newRerollDie, 'CHATCONTEXT.rerollDamage', { cheat: false });
    
    if (isCheat) {
        const diceData = diceMapping.map((mapping, idx) => ({
            rollIndex: idx, original: mapping.originalResult, faces: originalRoll.terms[mapping.termIdx].faces, attr: 'damage', cssClass: 'fail', tooltip: game.i18n.localize('Trefferpunkte')
        }));
        const cheatResults = await promptRerollCheat(diceData);
        if (!cheatResults) {
            ui.notifications.warn(game.i18n.localize("FateTab.ActionCancelled"));
            return null;
        }
        let cheatIdx = 0;
        newRerollDie.terms.forEach(term => {
            if (term.results) term.results.forEach(res => { res.result = cheatResults[cheatIdx++]; });
        });
        if (typeof newRerollDie._evaluateTotal === 'function') newRerollDie._total = newRerollDie._evaluateTotal();
    }

    newRerollDie.dice.forEach(die => die.options.colorset = FateRolls.DICE_COLOR_BLACK);
    await DiceDSA5.showDiceSoNice(newRerollDie, data.messageMode);
    
    let finalRoll = Roll.fromData(originalRoll.toJSON());
    let newResultFlatIndex = 0;
    let damageChangesHtml = [];

    newRerollDie.terms.forEach(term => {
        if (term.results) {
            term.results.forEach(res => {
                let map = diceMapping[newResultFlatIndex];
                let oldVal = map.originalResult;
                let newVal = res.result;
                let faces = originalRoll.terms[map.termIdx].faces;

                if (typeof FateRolls.formatDieChange === 'function') {
                    let formatted = FateRolls.formatDieChange(oldVal, newVal, { char: 'damage', faces: faces });
                    damageChangesHtml.push(formatted.html);
                } else {
                    damageChangesHtml.push(`${oldVal} -> ${newVal}`);
                }

                finalRoll.terms[map.termIdx].results[map.resIdx].result = newVal;
                newResultFlatIndex++;
            });
        }
    });
    
    if (typeof finalRoll._evaluateTotal === 'function') finalRoll._total = finalRoll._evaluateTotal();
    finalRoll = await DiceDSA5.manualRolls(finalRoll, 'CHATCONTEXT.rerollDamage', { cheat: false });
    
    foundry.utils.setProperty(finalRoll, "options.diceSoNice", false);
    
    newTestData.damageRoll = finalRoll.toJSON();
    newTestData.damageRoll.options = newTestData.damageRoll.options || {};
    newTestData.damageRoll.options.diceSoNice = false;

    const chatActionLabel = isMasterDamageReroll ? game.i18n.localize("FateTab.MasterDarkness") : game.i18n.localize("FateTab.RerollDamage");
    let chatRollDetails = "";
    if (typeof FateRolls.formatDieChangesHtml === 'function') {
        chatRollDetails = FateRolls.formatDieChangesHtml(damageChangesHtml);
    } else if (damageChangesHtml.length > 0) {
        chatRollDetails = game.i18n.format("FateTab.NewRoll", { roll: damageChangesHtml.join(', ') });
    }

    const flagToUpdate = isMasterDamageReroll ? null : FateRolls.FLAGS.FATE_DAMAGE_REROLL;
    return { chatActionLabel, chatRollDetails, flagToUpdate };
}

// Qualitätsstufe erhöhen
export async function executeAddQS(app, newTestData, cardOptions, avesDouble) {
    let qsToAdd = 1;
    
    if (avesDouble) {
        qsToAdd = 2;
    } else if (app.selectedPool === 'special' && app.selectedSpecialKey) {
        const qsList = DSA5GodsMenuConfig.qsandreroll?.[app.selectedSpecialKey];
        const rollNameContext = newTestData.source?.name || "";
        if (qsList && (qsList.includes("ALL") || qsList.some(k => game.i18n.localize(k) === rollNameContext))) {
            qsToAdd = 2;
        }
    }

    DSA5_Utility.clearUserTargets();
    cardOptions.fatePointAddQSUsed = true;
    newTestData.qualityStep = qsToAdd;

    const chatActionLabel = game.i18n.localize("FateTab.AddQS");
    const chatRollDetails = game.i18n.format("FateTab.AddQSChatDetail", { qs: qsToAdd }); 

    return { chatActionLabel, chatRollDetails, flagToUpdate: FateRolls.FLAGS.FATE_ADD_QS };
}

// Fieser Schaden

export async function executeFieserSchaden(app, data, newTestData, isCheat) {
    const origDamageData = data.postData.damageRoll || data.preData.damageRoll;
    const originalRoll = origDamageData instanceof Roll ? origDamageData : Roll.fromData(origDamageData);
    
    let extraDie = await new Roll("1d6").evaluate();
    let extraDamage = extraDie.total;
    
    if (isCheat) {
        const cheatResults = await promptRerollCheat([{
            rollIndex: 0, original: 6, faces: 6, attr: 'damage', cssClass: 'fail', tooltip: '+1D6'
        }]);
        if (!cheatResults) {
            ui.notifications.warn(game.i18n.localize("FateTab.ActionCancelled"));
            return null;
        }
        extraDamage = cheatResults[0];
    }

    const newFormula = `${originalRoll.formula} + 1d6`;
    const newTermsData = originalRoll.terms.map(t => t.toJSON());
    
    const plusData = new foundry.dice.terms.OperatorTerm({operator: "+"}).toJSON();
    plusData.evaluated = true;
    newTermsData.push(plusData);
    
    const extraTermData = extraDie.terms[0].toJSON();
    if (isCheat) extraTermData.results[0].result = extraDamage;
    newTermsData.push(extraTermData);
    
    let newRoll = Roll.fromData({
        formula: newFormula,
        terms: newTermsData,
        evaluated: true,
        total: originalRoll.total + extraDamage
    });

    newRoll.dice.forEach(die => die.options.colorset = FateRolls.DICE_COLOR_BLACK);
    await DiceDSA5.showDiceSoNice(newRoll, data.messageMode);
    
    newTestData.damageRoll = newRoll.toJSON();

    const chatActionLabel = game.i18n.localize("FateTab.MasterNastyDamage");
    const chatRollDetails = game.i18n.format("FateTab.ExtraDamage", { damage: extraDamage });

    return { chatActionLabel, chatRollDetails, flagToUpdate: 'fieserSchadenUsed' };
}

// Gescheiterter Angriff

export async function executeGescheitert(app, data, cardOptions) {
    const successLvl = data.postData?.successLevel ?? data.postData?.result?.successLevel ?? 0;
    const isCrit = (successLvl > 2) || data.postData?.result?.critical;
    const cost = isCrit ? 3 : 2;
    const failureText = game.i18n.localize("Failure"); 
    
    data.postData.successLevel = -1;
    data.postData.success = false;
    data.postData.description = failureText;
    data.postData.critical = false;
    data.postData.halfDefense = false;
    if (data.postData.result) {
        data.postData.result.successLevel = -1;
        data.postData.result.success = false;
        data.postData.result.critical = false;
        data.postData.result.description = failureText;
    }
    if (data.postData.characteristics) data.postData.characteristics.forEach(c => c.success = false);
    if (data.postData.result?.characteristics) data.postData.result.characteristics.forEach(c => c.success = false);
    
    const chatActionLabel = game.i18n.localize("FateTab.MasterFailedAttack");
    const chatRollDetails = game.i18n.format("FateTab.MasterFailedDesc", { cost: cost });
    
    cardOptions.skipNativePostFunction = true;

    return { chatActionLabel, chatRollDetails, cost };
}

// Modifikationen (Verbessern / Spezial Reroll)
 
export async function executeImprove(app, data, newTestData, isCheat, cardOptions, avesDouble = false) {
    let specialRollsText = [];
    let flagsToUpdate = [];

    const improvementAmount = avesDouble ? (FateRolls.IMPROVEMENT_VALUE * 2) : FateRolls.IMPROVEMENT_VALUE;

    // Götter und Erzdämonen Reroll
    if (app.selectedForSpecialReroll >= 0) {
        const isPhex = app.dsaActor.items.some(item => item.type === 'specialability' && item.name === game.i18n.localize('LocalizedIDs.traditionPhex'));
        
        const rerollData = await processReroll(
            [app.selectedForSpecialReroll],
            newTestData, data.postData, 'CHATCONTEXT.Reroll', true, app.dsaActor, isPhex, isCheat
        );
        
        if (!rerollData) return null;
        specialRollsText = rerollData.changedRollsHtml;
        flagsToUpdate.push(FateRolls.FLAGS.FATE_REROLL);
    } 
    // Basis "Ergebnis verbessern"
    else if (app.selectedForImprove >= 0) {
        const dieIndex = app.selectedForImprove;
        if (!(newTestData.roll instanceof Roll)) newTestData.roll = Roll.fromData(newTestData.roll);
        
        const originalResult = newTestData.roll.terms[dieIndex * 2].results[0].result;       
        const improvedResult = Math.max(1, originalResult - improvementAmount);
        newTestData.roll.editRollAtIndex([{ index: dieIndex, val: improvedResult }]);

        const fws = [0, 0, 0];
        fws[dieIndex] = improvementAmount;
        const modifier = {
            name: game.i18n.localize('CHATCONTEXT.improveFate'),
            value: (data.postData.characteristics && data.postData.characteristics.length > 1) ? fws.join('|') : improvementAmount,
            type: 'roll'
        };
        
        newTestData.situationalModifiers = newTestData.situationalModifiers || [];
        newTestData.situationalModifiers.push(modifier);
        flagsToUpdate.push(FateRolls.FLAGS.FATE_IMPROVED);
    }
    
    newTestData.fateUsed = true;
    
    const qsList = DSA5GodsMenuConfig.qsandreroll?.[app.selectedSpecialKey];
    const rollNameContext = newTestData.source?.name || "";
    let isQsAndReroll = false;
    
    if (qsList && (qsList.includes("ALL") || qsList.some(k => game.i18n.localize(k) === rollNameContext))) {
        isQsAndReroll = true;
    }

    if (isQsAndReroll) {
        cardOptions.fatePointAddQSUsed = true;
        newTestData.qualityStep = (newTestData.qualityStep || 0) + 2; 
        flagsToUpdate.push(FateRolls.FLAGS.FATE_ADD_QS);
    }
    
    let chatActionLabel = "";
    if (app.tabGroups.sheet.startsWith('specialAction_')) {
        const isGod = DSA5GodsMenuConfig.godListNames.includes(app.selectedSpecialKey);
        const translatedName = game.i18n.localize(isGod ? `God.${app.selectedSpecialKey}.Name` : `Demon.${app.selectedSpecialKey}.Name`);
        chatActionLabel = `${game.i18n.localize("FateTab.SpecialSchipAction")} [${translatedName}]`;
    } else {
        chatActionLabel = game.i18n.localize("FateTab.Improve");
    }

    return { chatActionLabel, flagsToUpdate, specialRollsText };
}

// Hilfsfunktionen (Schips abziehen, Münze werfen)

export async function consumeSchip(actor, schipToConsume) {
    if (!schipToConsume) return;

    if (schipToConsume.pool === 'personal') {
        const currentPoints = actor.system.status.fatePoints.value;
        await actor.update({ 'system.status.fatePoints.value': Math.max(0, currentPoints - 1) });
    } else if (schipToConsume.pool === 'group') {
        await FateRolls.reduceGroupSchip();
    } else if (schipToConsume.pool === 'special' && schipToConsume.key) {
        const path = `flags.dsa5.specialPoints.${schipToConsume.key}.current`;
        const currentVal = foundry.utils.getProperty(actor, path) || 0;
        await actor.update({ [path]: Math.max(0, currentVal - 1) });
    } else if (schipToConsume.pool === 'master') {
        const amount = schipToConsume.amount || 1;
        const raw = game.settings.get('dsa5', 'masterschips') || "0/0";
        let [cur, max] = raw.split('/').map(Number);
        await game.settings.set('dsa5', 'masterschips', `${Math.max(0, cur - amount)}/${max}`);
    }
}

export async function throwCoin() {
    const coinRoll = await new Roll('1DC').evaluate();
    await DiceDSA5.showDiceSoNice(coinRoll, game.settings.get("core", "messageMode"));
    return coinRoll;
}
