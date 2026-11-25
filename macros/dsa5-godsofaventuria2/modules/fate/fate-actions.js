import { DSA5_Utility, DiceDSA5, FateRolls } from './dsa5-api.js';
import { DSA5GodsMenuConfig, REGEN_BLESSING_CONFIG } from './config.js';
import { promptAvesCheat, promptAvesReroll, promptAvesDamageReroll, promptRerollCheat, promptRegenDistribution, promptSchipSwap, promptSpecialRollCheat } from './fate-dialogs.js';
import { extractDamageDice, getEligibleCompanions } from './fate-context.js';
import { applyRegenBlessing, applyDemonSchipRegen } from './fate-effects.js';
import { notifyHeroSchipSpent } from './master-schip-automation.js';

const { renderTemplate } = foundry.applications.handlebars;

const REGEN_STAT_MAP = {
    LeP: { label: 'wounds', color: 'mu' },
    AsP: { label: 'astralenergy', color: 'ge' },
    KaP: { label: 'karmaenergy', color: 'in' },
};

// Götter-/Dämonen-Schip Kernlogik (gemeinsam für Unified Fate GUI & Burger-Menü-Schips)

export function isBlockedFromGodSchips(actor, key) {
    if (!DSA5GodsMenuConfig.isGod(key) || key === 'Namenloser') return false;

    const hasDemonMark = actor.items.some((i) => i.type === 'demonmark');
    const hasNamelessTradition = actor.items.some((i) => i.name === _loc('LocalizedIDs.traditionNameless'));
    if (!hasDemonMark && !hasNamelessTradition) return false;

    const locKey = hasDemonMark ? 'DSAError.demonPactNoGodSchips' : 'DSAError.namelessCultistNoGodSchips';
    ui.notifications.error(_loc(locKey, { name: actor.name }));
    return true;
}

async function resolveSpecialSymbolOutcome(actor, key, d1, d2, isGod, isPhexStandard) {
    const godSymbol = d1 === 6;
    const khaSymbol = d2 === 6;
    switch (`${Number(godSymbol)}${Number(khaSymbol)}`) {
        case '11':
            return {
                executeEffect: true,
                schipToConsume: null,
                resultColor: 'darkgreen',
                resultTitle: _loc('GodsMenu.FateTab.SpecialRollSuccessTitle'),
                resultDesc: _loc('GodsMenu.FateTab.SpecialRollSuccessDesc'),
                resultTooltip: 'GodsMenu.SchipRules.Dice2',
            };
        case '10':
            if (key === 'Phex' && isPhexStandard) {
                return {
                    executeEffect: true,
                    schipToConsume: null,
                    resultColor: 'darkgreen',
                    resultTitle: _loc('GodsMenu.FateTab.PhexRefundTitle'),
                    resultDesc: _loc('GodsMenu.FateTab.PhexRefundDesc'),
                    resultTooltip: 'GodsMenu.FateTab.PhexRefundDesc',
                };
            }
            {
                const chosen = await promptSchipSwap(actor, key, isGod);
                const schipToConsume = chosen ?? { pool: 'special', key };
                return {
                    executeEffect: true,
                    schipToConsume,
                    resultColor: chosen ? 'darkblue' : 'black',
                    resultTitle: _loc(chosen ? 'GodsMenu.FateTab.SpecialRollFlexibleTitle' : 'GodsMenu.FateTab.SpecialRollNormalTitle'),
                    resultDesc: _loc(chosen ? 'GodsMenu.FateTab.SpecialRollFlexibleDesc' : 'GodsMenu.FateTab.SpecialRollNormalDesc'),
                    resultTooltip: chosen ? 'GodsMenu.SchipRules.Dice3' : 'GodsMenu.SchipRules.Dice5',
                };
            }
        case '01':
            return {
                executeEffect: false,
                schipToConsume: null,
                resultColor: 'darkred',
                resultTitle: _loc('GodsMenu.FateTab.SpecialRollBlockedTitle'),
                resultDesc: _loc('GodsMenu.FateTab.SpecialRollBlockedDesc', {
                    blocker: _loc(isGod ? 'GodsMenu.KhaSymbol' : 'GodsMenu.StarWallSymbol'),
                    actorSymbol: _loc(isGod ? 'GodsMenu.GodSymbol' : 'GodsMenu.DemonSymbol'),
                }),
                resultTooltip: 'GodsMenu.SchipRules.Dice4',
            };
        default:
            return {
                executeEffect: true,
                schipToConsume: { pool: 'special', key },
                resultColor: 'black',
                resultTitle: _loc('GodsMenu.FateTab.SpecialRollNormalTitle'),
                resultDesc: _loc('GodsMenu.FateTab.SpecialRollNormalDesc'),
                resultTooltip: 'GodsMenu.SchipRules.Dice5',
            };
    }
}

export async function rollSpecialSchipSymbols({ actor, key, isCheat = false, isPhexStandard = false }) {
    const isGod = DSA5GodsMenuConfig.isGod(key);
    const d1Icon = DSA5GodsMenuConfig.diceIcon(key);
    const d2Icon = DSA5GodsMenuConfig.diceIcon(null, isGod ? 'Kha.webp' : 'Sternenwall.webp');

    const roll = await new Roll('1d6 + 1d6').evaluate();
    let d1;
    let d2;

    if (isCheat) {
        const cheatResult = await promptSpecialRollCheat(
            _loc('GodsMenu.FateTab.SpecialRollTitle'),
            d1Icon,
            _loc(isGod ? 'GodsMenu.FateTab.GodDie' : 'GodsMenu.FateTab.DemonDie'),
            d2Icon,
            _loc(isGod ? 'GodsMenu.FateTab.KhaDie' : 'GodsMenu.FateTab.StarwallDie'),
        );
        if (cheatResult === null) {
            ui.notifications.warn(_loc('GodsMenu.FateTab.ActionCancelled'));
            return null;
        }
        ({ d1, d2 } = cheatResult);
        roll.terms[0].results[0].result = d1;
        roll.terms[2].results[0].result = d2;
        roll._total = d1 + d2;
    } else {
        d1 = roll.terms[0].results[0].result;
        d2 = roll.terms[2].results[0].result;
    }

    await DiceDSA5.showDiceSoNice(roll, game.settings.get('core', 'messageMode'));

    if (!isGod) await applyDemonSchipRegen(actor);

    const outcome = await resolveSpecialSymbolOutcome(actor, key, d1, d2, isGod, isPhexStandard);

    const die1Tooltip = _loc(isGod ? 'GodsMenu.GodSymbol' : 'GodsMenu.DemonSymbol');
    const die2Tooltip = _loc(isGod ? 'GodsMenu.KhaSymbol' : 'GodsMenu.StarWallSymbol');
    const causeIcons = [];
    if (d1 === 6) causeIcons.push({ img: d1Icon, tooltip: die1Tooltip });
    if (d2 === 6) causeIcons.push({ img: d2Icon, tooltip: die2Tooltip });

    const specialRollHtml = await renderTemplate(DSA5GodsMenuConfig.templatePath('fate/special-roll-result.hbs'), {
        die1Img: d1 === 6 ? d1Icon : null,
        die2Img: d2 === 6 ? d2Icon : null,
        d1Val: d1,
        d2Val: d2,
        die1Tooltip,
        die2Tooltip,
        die1Label: _loc(isGod ? 'GodsMenu.FateTab.GodDie' : 'GodsMenu.FateTab.DemonDie'),
        die2Label: _loc(isGod ? 'GodsMenu.FateTab.KhaDie' : 'GodsMenu.FateTab.StarwallDie'),
        causeIcons,
        resultTitle: outcome.resultTitle,
        resultDesc: outcome.resultDesc,
        resultTooltip: outcome.resultTooltip,
        resultColor: outcome.resultColor,
    });

    return {
        executeEffect: outcome.executeEffect,
        schipToConsume: outcome.schipToConsume,
        specialRollHtml,
    };
}

export async function buildFateChatContent({
    actor,
    actionLabel,
    rollDetails = '',
    specialRollHtml = '',
    displayPool,
    displayKey = null,
    isConsumed = true,
    consumedAmount = 1,
    blocked = false,
}) {
    const consumedMod = isConsumed ? consumedAmount : 0;
    let actorName = actor.name;
    let actionText = blocked ? _loc('GodsMenu.FateTab.usageBlocked') : _loc('GodsMenu.usesPointFor');
    const headingKey = blocked ? 'GodsMenu.FateTab.UsageBlockedTitle' : 'CHATFATE.fatepointUsed';

    let tooltip = '';
    let schips = [];

    switch (displayPool) {
        case 'personal': {
            const max = actor.system.status.fatePoints.current || 0;
            const available = Math.max(0, (actor.system.status.fatePoints.value || 0) - consumedMod);
            tooltip = _loc('CHATFATE.PointsRemaining');
            schips = DSA5GodsMenuConfig.buildSchipDots(max, available, (_isFull, _i, css) => ({ cssClass: css, style: '' }));
            break;
        }
        case 'group': {
            const { current, max } = DSA5GodsMenuConfig.getSchipSetting('groupschips');
            tooltip = _loc('CHATFATE.GroupPointsRemaining');
            schips = DSA5GodsMenuConfig.buildSchipDots(max, Math.max(0, current - consumedMod), (_isFull, _i, css) => ({ cssClass: css, style: '' }));
            break;
        }
        case 'special': {
            const { current, max } = DSA5GodsMenuConfig.getSpecialSchip(actor, displayKey);
            const style = DSA5GodsMenuConfig.chipStyle(displayKey);
            tooltip = _loc('GodsMenu.FateTab.SpecialPointsRemaining', { name: DSA5GodsMenuConfig.schipName(displayKey) });
            schips = DSA5GodsMenuConfig.buildSchipDots(max, Math.max(0, current - consumedMod), (_isFull, _i, css) => ({
                cssClass: `${css} gods-schip custom-special-schips`,
                style,
            }));
            break;
        }
        case 'master': {
            const { current, max } = DSA5GodsMenuConfig.getSchipSetting('masterschips');
            tooltip = _loc('GodsMenu.FateTab.MasterPointsRemaining');
            actorName = _loc('Gamemaster');
            if (!blocked) actionText = _loc('GodsMenu.FateTab.MasterUsesPointFor');
            schips = DSA5GodsMenuConfig.buildMasterSchipDots(max, Math.max(0, current - consumedMod), { background: true });
            break;
        }
    }

    return renderTemplate(DSA5GodsMenuConfig.templatePath('fate/chat-action-card.hbs'), {
        headingKey,
        actorName,
        actionText,
        actionLabel,
        tooltip,
        schips,
        specialRollHtml,
        rollDetails,
    });
}

export async function triggerStandaloneSpecialSchip({ actor, key, actionLabel, rollDetails = '' }) {
    if (DSA5GodsMenuConfig.getSpecialSchip(actor, key).current <= 0) {
        ui.notifications.error(_loc('DSAError.specialSchipEmpty'));
        return { executed: false, blocked: false };
    }
    if (isBlockedFromGodSchips(actor, key)) {
        return { executed: false, blocked: false };
    }

    const symbolResult = await rollSpecialSchipSymbols({ actor, key });
    if (!symbolResult) return { executed: false, blocked: false };

    const { executeEffect, schipToConsume, specialRollHtml } = symbolResult;

    if (!executeEffect) {
        const chatContent = await buildFateChatContent({
            actor,
            actionLabel,
            specialRollHtml,
            displayPool: 'special',
            displayKey: key,
            isConsumed: false,
            consumedAmount: 0,
            blocked: true,
        });
        await ChatMessage.create(DSA5_Utility.chatDataSetup(chatContent));
        return { executed: false, blocked: true };
    }

    const finalPool = schipToConsume ? schipToConsume.pool : 'special';
    const finalKey = schipToConsume ? schipToConsume.key : key;
    const isConsumed = schipToConsume !== null;
    const consumedAmount = schipToConsume?.amount || 1;

    const chatContent = await buildFateChatContent({
        actor,
        actionLabel,
        rollDetails,
        specialRollHtml,
        displayPool: finalPool,
        displayKey: finalKey,
        isConsumed,
        consumedAmount,
    });
    await ChatMessage.create(DSA5_Utility.chatDataSetup(chatContent));
    await consumeSchip(actor, schipToConsume);

    return { executed: true, blocked: false, schipToConsume };
}

export async function triggerStandaloneMasterSchip({ actor, actionLabel, rollDetails = '', amount = 1 }) {
    if (!game.user.isGM) return { executed: false };

    const { current } = DSA5GodsMenuConfig.getSchipSetting('masterschips');
    if (current < amount) {
        ui.notifications.error(_loc('GodsMenu.FateTab.MasterSchipEmpty'));
        return { executed: false };
    }

    const chatContent = await buildFateChatContent({
        actor,
        actionLabel,
        rollDetails,
        displayPool: 'master',
        isConsumed: true,
        consumedAmount: amount,
    });
    await ChatMessage.create(DSA5_Utility.chatDataSetup(chatContent));
    await consumeSchip(actor, { pool: 'master', amount });

    return { executed: true };
}

// Aves-Münzwurf & zweiter Nachwurf

async function postAvesSecondRollChat(rollDetailsHtml) {
    const heading = `${_loc('GodsMenu.FateTab.AvesHeadTitle')} (${_loc('GodsMenu.FateTab.AvesSecondRoll')})`;
    await ChatMessage.create(DSA5_Utility.chatDataSetup(`<h5 class="center"><b>${heading}</b></h5>${rollDetailsHtml}`));
}

export async function resolveAvesCoin({ actor, selectedPool, selectedSpecialKey, isStandard, coinRoll, isCheat }) {
    if (selectedPool !== 'special' || selectedSpecialKey !== 'Aves' || !isStandard) {
        return { avesDouble: false, avesCoinHtml: '' };
    }

    if (isCheat) {
        const cheatResult = await promptAvesCheat();
        if (cheatResult === null) {
            ui.notifications.warn(_loc('GodsMenu.FateTab.ActionCancelled'));
            return null;
        }
        coinRoll.terms[0].results[0].result = cheatResult;
        coinRoll._total = cheatResult;
    }

    const avesDouble = coinRoll.total === 1;
    const avesCoinHtml = await renderTemplate(DSA5GodsMenuConfig.templatePath('fate/aves-coin-result.hbs'), {
        actorName: actor.name,
        avesImg: DSA5GodsMenuConfig.chipIcon('Aves'),
        isSuccess: avesDouble,
        resultTitle: _loc(avesDouble ? 'GodsMenu.FateTab.AvesHeadTitle' : 'GodsMenu.FateTab.AvesTailTitle'),
        resultDesc: _loc(avesDouble ? 'GodsMenu.FateTab.AvesHeadDesc' : 'GodsMenu.FateTab.AvesTailDesc'),
    });

    return { avesDouble, avesCoinHtml };
}

export async function executeAvesSecondReroll({ actor, message, data, newTestData, cardOptions, isCheat }) {
    const diesToReroll = await promptAvesReroll(data.preData, data.postData);
    if (!diesToReroll?.length) return;

    const isPhex = DSA5GodsMenuConfig.hasPhexTradition(actor);
    const rerollData = await processReroll(diesToReroll, newTestData, data.postData, 'CHATCONTEXT.Reroll', false, actor, isPhex, isCheat);
    if (!rerollData) {
        ui.notifications.warn(_loc('GodsMenu.FateTab.ActionCancelled'));
        return;
    }

    newTestData.fateUsed = true;
    await actor[data.postData.postFunction]({ testData: newTestData, cardOptions }, { rerenderMessage: message });
    await postAvesSecondRollChat(FateRolls.formatDieChangesHtml(rerollData.changedRolls));
}

export async function executeAvesSecondDamageReroll({ actor, message, data, newTestData, cardOptions, isCheat }) {
    const damageDice = extractDamageDice(newTestData.damageRoll);
    if (!damageDice.length) return;

    const dieIndex = await promptAvesDamageReroll(damageDice);
    if (dieIndex === null) return;

    const rerollResult = await processDamageReroll([dieIndex], newTestData.damageRoll, data.messageMode, isCheat);
    if (!rerollResult) return;

    newTestData.damageRoll = rerollResult.damageRoll;
    DSA5_Utility.clearUserTargets();
    await actor[data.postData.postFunction]({ testData: newTestData, cardOptions }, { rerenderMessage: message });

    const updatedMsg = game.messages.get(message.id);
    if (updatedMsg?.isOwner) {
        await updatedMsg.update({ [`flags.data.${FateRolls.FLAGS.FATE_DAMAGE_REROLL}`]: true });
    }

    await postAvesSecondRollChat(rerollResult.chatRollDetails);
}

// Wurf-Reroll und Auswertung

export async function processReroll(diceIndices, testData, postData, rollContext, useMinimum = false, actor = null, isPhex = false, isCheat = false) {
    if (!(testData.roll instanceof Roll)) testData.roll = DiceDSA5.fromRollData(testData.roll);

    let cheatResults = null;
    if (isCheat) {
        const diceData = diceIndices.map((dieIndex, rollIndex) => {
            const charData = postData?.characteristics?.[dieIndex] || {};
            const term = testData.roll.terms[dieIndex * 2];
            const attr = charData.char || 'd20';
            return {
                rollIndex,
                original: charData.res ?? term.results[0].result,
                faces: term.faces,
                attr,
                cssClass: charData.suc ? 'suc' : (charData.suc === false ? 'fail' : ''),
                tooltip: charData.tar ? `${_loc(`CHARAbbrev.${attr.toUpperCase()}`)} vs ${charData.tar}` : '',
            };
        });

        cheatResults = await promptRerollCheat(diceData);
        if (!cheatResults) return null;
    }

    return FateRolls.processSelectedReroll(diceIndices, testData, {
        rollContext,
        useMinimum,
        actor,
        isPhex,
        cheatResults,
    });
}

// Reroll (W20)

export async function executeReroll(app, data, newTestData, isCheat, isMasterReroll, isXeledon = false) {
    if (app.selectedForReroll.size === 0) {
        ui.notifications.warn(_loc('DSAError.noDieSelected'));
        return null;
    }

    const rollActor = isXeledon ? app.targetActor : app.dsaActor;
    const isPhex = !isXeledon && DSA5GodsMenuConfig.hasPhexTradition(rollActor);
    const rerollData = await processReroll(
        Array.from(app.selectedForReroll).sort((a, b) => a - b),
        newTestData, data.postData, 'CHATCONTEXT.Reroll', false, rollActor, isPhex, isCheat,
    );
    if (!rerollData) return null;

    if (data.postData.characteristics) {
        rerollData.changes.forEach((c) => {
            const charObj = data.postData.characteristics[c.index];
            if (charObj) {
                charObj.res = c.val;
                if (charObj.tar !== undefined) charObj.suc = c.val <= charObj.tar;
            }
        });
    }
    newTestData.fateUsed = true;

    const chatActionLabel = isXeledon
        ? _loc('GodsMenu.FateTab.XeledonActionLabel', { label: _loc('GodsMenu.FateTab.Reroll') })
        : _loc(isMasterReroll ? 'GodsMenu.FateTab.MasterFate' : 'GodsMenu.FateTab.Reroll');

    return {
        chatActionLabel,
        chatRollDetails: FateRolls.formatDieChangesHtml(rerollData.changedRolls),
        flagToUpdate: isMasterReroll ? 'meisterSchicksalUsed' : FateRolls.FLAGS.FATE_REROLL,
    };
}

// Schadenswurf wiederholen

export async function processDamageReroll(selectedIndices, origDamageData, messageMode, isCheat = false) {
    const originalRoll = DiceDSA5.fromRollData(origDamageData);
    if (!originalRoll?.terms) return null;

    const sortedIndices = [...selectedIndices].sort((a, b) => a - b);
    const rerollFormulas = [];
    const diceMapping = [];

    let globalIndex = 0;
    for (let termIdx = 0; termIdx < originalRoll.terms.length; termIdx++) {
        const term = originalRoll.terms[termIdx];
        if (!term.results) continue;
        for (let resIdx = 0; resIdx < term.results.length; resIdx++) {
            if (sortedIndices.includes(globalIndex)) {
                rerollFormulas.push(`1d${term.faces}`);
                diceMapping.push({ termIdx, resIdx, originalResult: term.results[resIdx].result });
            }
            globalIndex++;
        }
    }

    if (!rerollFormulas.length) return null;

    let newRerollDie = await new Roll(rerollFormulas.join(' + ')).evaluate();
    if (!isCheat) {
        newRerollDie = await DiceDSA5.manualRolls(newRerollDie, 'CHATCONTEXT.rerollDamage', { cheat: false });
    } else {
        const diceData = diceMapping.map((mapping, idx) => ({
            rollIndex: idx,
            original: mapping.originalResult,
            faces: originalRoll.terms[mapping.termIdx].faces,
            attr: 'damage',
            cssClass: 'fail',
            tooltip: _loc('Trefferpunkte'),
        }));
        const cheatResults = await promptRerollCheat(diceData);
        if (!cheatResults) {
            ui.notifications.warn(_loc('GodsMenu.FateTab.ActionCancelled'));
            return null;
        }
        let cheatIdx = 0;
        newRerollDie.terms.forEach((term) => {
            term.results?.forEach((res) => { res.result = cheatResults[cheatIdx++]; });
        });
        newRerollDie._total = newRerollDie._evaluateTotal();
    }

    newRerollDie.dice.forEach((die) => { die.options.colorset = FateRolls.DICE_COLOR_BLACK; });
    await DiceDSA5.showDiceSoNice(newRerollDie, messageMode);

    const finalRoll = Roll.fromData(originalRoll.toJSON());
    let newResultFlatIndex = 0;
    const damageChangesHtml = [];

    newRerollDie.terms.forEach((term) => {
        term.results?.forEach((res) => {
            const map = diceMapping[newResultFlatIndex++];
            const faces = originalRoll.terms[map.termIdx].faces;
            damageChangesHtml.push(FateRolls.formatDieChange(map.originalResult, res.result, { char: 'damage', faces }).html);
            finalRoll.terms[map.termIdx].results[map.resIdx].result = res.result;
        });
    });

    finalRoll._total = finalRoll._evaluateTotal();
    const damageRoll = finalRoll.toJSON();
    damageRoll.options = { ...damageRoll.options, diceSoNice: false };

    return {
        damageRoll,
        chatRollDetails: FateRolls.formatDieChangesHtml(damageChangesHtml),
    };
}

export async function executeDamageReroll(app, data, newTestData, isCheat, isMasterDamageReroll, isXeledon = false) {
    if (app.selectedForDamageReroll.size === 0) {
        ui.notifications.warn(_loc('DSAError.noDieSelected'));
        return null;
    }
    if (!isMasterDamageReroll && app.selectedForDamageReroll.size > 1) {
        ui.notifications.warn(_loc('DSAError.maxOneDie'));
        return null;
    }

    const origDamageData = data.postData.damageRoll || data.preData.damageRoll;
    const result = await processDamageReroll(app.selectedForDamageReroll, origDamageData, data.messageMode, isCheat);
    if (!result) return null;

    newTestData.damageRoll = result.damageRoll;

    const chatActionLabel = isXeledon
        ? _loc('GodsMenu.FateTab.XeledonActionLabel', { label: _loc('GodsMenu.FateTab.RerollDamage') })
        : _loc(isMasterDamageReroll ? 'GodsMenu.FateTab.MasterDarkness' : 'GodsMenu.FateTab.RerollDamage');

    return {
        chatActionLabel,
        chatRollDetails: result.chatRollDetails,
        flagToUpdate: isMasterDamageReroll ? null : FateRolls.FLAGS.FATE_DAMAGE_REROLL,
    };
}

// Qualitätsstufe erhöhen / verringern (Xeledon)

export async function executeAddQS(app, newTestData, cardOptions, avesDouble) {
    const qsToAdd = (avesDouble || (app.selectedPool === 'special' && DSA5GodsMenuConfig.isQsAndReroll(app.selectedSpecialKey, newTestData.source?.name || '')))
        ? 2
        : 1;

    DSA5_Utility.clearUserTargets();
    cardOptions.fatePointAddQSUsed = true;
    newTestData.qualityStep = (Number(newTestData.qualityStep) || 0) + qsToAdd;

    return {
        chatActionLabel: _loc('GodsMenu.FateTab.AddQS'),
        chatRollDetails: _loc('GodsMenu.FateTab.AddQSChatDetail', { qs: qsToAdd }),
        flagToUpdate: FateRolls.FLAGS.FATE_ADD_QS,
    };
}

export async function executeXeledonSubQS(data, newTestData, cardOptions) {
    const currentQS = Number(data.postData.qualityStep) || 0;
    const rawFpQS = Math.max(1, Math.ceil((Number(data.postData.result) || 0) / 3));
    const existingQS = Number(newTestData.qualityStep) || 0;
    const overshoot = Math.max(0, rawFpQS + existingQS - currentQS);

    DSA5_Utility.clearUserTargets();
    cardOptions.fatePointAddQSUsed = true;
    newTestData.qualityStep = existingQS - 1 - overshoot;

    return {
        chatActionLabel: _loc('GodsMenu.FateTab.XeledonActionLabel', { label: _loc('GodsMenu.FateTab.AddQS') }),
        chatRollDetails: _loc('GodsMenu.FateTab.XeledonSubQSChatDetail'),
        flagToUpdate: FateRolls.FLAGS.FATE_ADD_QS,
    };
}

// Fieser Schaden

export async function executeFieserSchaden(app, data, newTestData, isCheat) {
    const origDamageData = data.postData.damageRoll || data.preData.damageRoll;
    const originalRoll = DiceDSA5.fromRollData(origDamageData);
    if (!originalRoll?.terms) return null;

    let extraDie = await new Roll('1d6').evaluate();
    if (!isCheat) {
        extraDie = await DiceDSA5.manualRolls(extraDie, 'GodsMenu.FateTab.MasterNastyDamage', { cheat: false });
    }
    let extraDamage = extraDie.total;

    if (isCheat) {
        const cheatResults = await promptRerollCheat([{
            rollIndex: 0, original: 6, faces: 6, attr: 'damage', cssClass: 'fail', tooltip: '+1D6',
        }]);
        if (!cheatResults) {
            ui.notifications.warn(_loc('GodsMenu.FateTab.ActionCancelled'));
            return null;
        }
        extraDamage = cheatResults[0];
    }

    const newTermsData = originalRoll.terms.map((t) => t.toJSON());
    const plusData = new foundry.dice.terms.OperatorTerm({ operator: '+' }).toJSON();
    plusData.evaluated = true;
    newTermsData.push(plusData);

    const extraTermData = extraDie.terms[0].toJSON();
    if (isCheat) extraTermData.results[0].result = extraDamage;
    newTermsData.push(extraTermData);

    const newRoll = Roll.fromData({
        formula: `${originalRoll.formula} + 1d6`,
        terms: newTermsData,
        evaluated: true,
        total: originalRoll.total + extraDamage,
    });

    newRoll.dice.forEach((die) => { die.options.colorset = FateRolls.DICE_COLOR_BLACK; });
    await DiceDSA5.showDiceSoNice(newRoll, data.messageMode);

    newTestData.damageRoll = newRoll.toJSON();

    return {
        chatActionLabel: _loc('GodsMenu.FateTab.MasterNastyDamage'),
        chatRollDetails: _loc('GodsMenu.FateTab.ExtraDamage', { damage: extraDamage }),
        flagToUpdate: 'fieserSchadenUsed',
    };
}

// Gescheiterter Angriff

export async function executeGescheitert(app, data, cardOptions) {
    const successLvl = data.postData.successLevel ?? 0;
    const isCrit = successLvl > 2 || data.postData.critical;
    const cost = isCrit ? 3 : 2;

    data.postData.successLevel = -1;
    data.postData.success = false;
    data.postData.critical = false;
    data.postData.description = _loc('Failure');
    data.postData.halfDefense = false;
    data.postData.characteristics?.forEach((c) => { c.success = false; });

    const renderData = { testData: data.postData, preData: data.preData, hideData: data.hideData, hideDamage: data.hideDamage };
    const html = await renderTemplate(data.template, renderData);
    await app.message.update({ content: html, 'flags.data': data });

    cardOptions.skipNativePostFunction = true;

    return {
        chatActionLabel: _loc('GodsMenu.FateTab.MasterFailedAttack'),
        chatRollDetails: _loc('GodsMenu.FateTab.MasterFailedDesc', { cost }),
        cost,
    };
}

// Modifikationen (Verbessern / Spezial Reroll)

export async function executeImprove(app, data, newTestData, isCheat, cardOptions) {
    let specialRollsText = [];
    const flagsToUpdate = [];

    if (app.selectedForSpecialReroll >= 0) {
        const isPhex = DSA5GodsMenuConfig.hasPhexTradition(app.dsaActor);
        const rerollData = await processReroll(
            [app.selectedForSpecialReroll],
            newTestData, data.postData, 'CHATCONTEXT.Reroll', true, app.dsaActor, isPhex, isCheat,
        );
        if (!rerollData) return null;
        specialRollsText = rerollData.changedRolls;
        flagsToUpdate.push(FateRolls.FLAGS.FATE_REROLL);
    } else if (app.tabGroups.sheet === 'improve' || app.selectedForImprove >= 0) {
        const multiDie = (data.postData.characteristics?.length ?? 0) > 1;
        const dieIndex = multiDie ? app.selectedForImprove : 0;
        if (multiDie && dieIndex < 0) {
            ui.notifications.warn(_loc('DSAError.noDieSelected'));
            return null;
        }
        FateRolls.applyImprovement(newTestData, dieIndex, FateRolls.IMPROVEMENT_VALUE, { multiDie });
        flagsToUpdate.push(FateRolls.FLAGS.FATE_IMPROVED);
    }

    newTestData.fateUsed = true;

    if (DSA5GodsMenuConfig.isQsAndReroll(app.selectedSpecialKey, newTestData.source?.name || '')) {
        cardOptions.fatePointAddQSUsed = true;
        newTestData.qualityStep = (Number(newTestData.qualityStep) || 0) + 2;
        flagsToUpdate.push(FateRolls.FLAGS.FATE_ADD_QS);
    }

    const chatActionLabel = app.tabGroups.sheet.startsWith('specialAction_')
        ? `${_loc('GodsMenu.FateTab.SpecialSchipAction')} [${DSA5GodsMenuConfig.schipName(app.selectedSpecialKey)}]`
        : _loc('GodsMenu.FateTab.Improve');

    return { chatActionLabel, flagsToUpdate, specialRollsText };
}

// Regeneration wiederholen (Meisterschip)

export async function executeMasterRegen(app, data, isCheat, cardOptions) {
    const idx = app.selectedForMasterRegen;
    if (idx < 0) {
        ui.notifications.warn(_loc('DSAError.noDieSelected'));
        return null;
    }

    const tpl = document.createElement('template');
    tpl.innerHTML = app.message.content;
    const span = tpl.content.querySelectorAll('.roll-result span.d6')[idx];
    if (!span) return null;

    const oldVal = parseInt(span.textContent, 10);
    const attr = span.getAttribute('class')?.match(/die-(LeP|AsP|KaP)/)?.[1];
    const statCfg = REGEN_STAT_MAP[attr];
    if (!statCfg) return null;

    let reroll = await new Roll('1d6').evaluate();
    if (!isCheat) {
        reroll = await DiceDSA5.manualRolls(reroll, 'CHATCONTEXT.Reroll', { cheat: false });
    }
    let newVal = reroll.terms[0].results[0].result;

    if (isCheat) {
        const cheatResults = await promptRerollCheat([{
            rollIndex: 0,
            original: oldVal,
            faces: 6,
            attr,
            cssClass: 'fail',
            tooltip: span.getAttribute('data-tooltip') || _loc(statCfg.label),
        }]);
        if (!cheatResults) {
            ui.notifications.warn(_loc('GodsMenu.FateTab.ActionCancelled'));
            return null;
        }
        newVal = cheatResults[0];
        reroll.terms[0].results[0].result = newVal;
        reroll._total = newVal;
    }

    await DiceDSA5._addRollDiceSoNice(
        data,
        reroll,
        game.dsa5.apps.DiceSoNiceCustomization.getAttributeConfiguration(statCfg.color),
    );

    const diff = newVal - oldVal;
    span.textContent = String(newVal);

    const updates = {};
    if (diff !== 0) {
        const catString = _loc(statCfg.label);
        const newStatVal = Math.max(0, (Number(data.postData[attr]) || 0) + diff);
        updates[`flags.data.postData.${attr}`] = newStatVal;

        const input = tpl.content.querySelector(`input.roll-edit[data-tooltip="${CSS.escape(catString)}"]`);
        if (input) {
            input.value = String(newStatVal);
            input.setAttribute('value', String(newStatVal));
        }
        tpl.content.querySelectorAll('.card-content').forEach((el) => {
            if (el.innerHTML.includes(`<b>${catString}</b>:`)) {
                el.innerHTML = `\n        <b>${catString}</b>: ${newStatVal}\n    `;
            }
        });
    }
    updates.content = tpl.innerHTML;

    await app.message.update(updates);
    cardOptions.skipNativePostFunction = true;

    const changeHtml = FateRolls.formatDieChange(oldVal, newVal, { char: attr, faces: 6 }).html;
    return {
        chatActionLabel: _loc('GodsMenu.FateTab.MasterRegen'),
        chatRollDetails: FateRolls.formatDieChangesHtml([changeHtml]),
        flagToUpdate: 'meisterRegenUsed',
    };
}

// Regenerationsverbesserung Mada / Travia): Vorbereitung

export async function prepareRegenBlessing(app, key) {
    const cfg = REGEN_BLESSING_CONFIG[key];
    if (!cfg) return null;

    if (app.message.flags?.dsa5?.rollRequest?.finalized) {
        ui.notifications.warn(_loc('GodsMenu.FateTab.GodsRegenDistributeFinalized'));
        return null;
    }
    if ((app.message.flags?.data?.fateSpecialUsed || []).includes(key)) {
        ui.notifications.warn(_loc('GodsMenu.FateTab.GodsRegenDistributeAlreadyUsed'));
        return null;
    }
    if (!game.user.isGM && !game.users.activeGM) {
        ui.notifications.error(_loc('GodsMenu.FateTab.GodsRegenDistributeNoGM'));
        return null;
    }

    const companions = getEligibleCompanions(app.dsaActor, app.message, key);
    if (!companions.length) {
        ui.notifications.warn(_loc('GodsMenu.FateTab.GodsRegenDistributeNoCompanions'));
        return null;
    }

    const allocations = await promptRegenDistribution({ key, cfg, companions });
    if (!allocations?.length) {
        ui.notifications.warn(_loc('GodsMenu.FateTab.ActionCancelled'));
        return null;
    }
    return allocations;
}

// Regenerationsverbesserung Mada / Travia):  Anwendung

export async function executeRegenBlessing(app, key, allocations, cardOptions) {
    const cfg = REGEN_BLESSING_CONFIG[key];
    const result = await applyRegenBlessing({
        key,
        casterId: app.dsaActor.id,
        messageId: app.message.id,
        allocations,
    });

    if (!result?.ok) {
        if (result?.reason === 'alreadyUsed') ui.notifications.warn(_loc('GodsMenu.FateTab.GodsRegenDistributeAlreadyUsed'));
        else if (result?.reason === 'finalized') ui.notifications.warn(_loc('GodsMenu.FateTab.GodsRegenDistributeFinalized'));
        else ui.notifications.error(_loc('GodsMenu.FateTab.GodsRegenDistributeNoGM'));
        return null;
    }

    cardOptions.skipNativePostFunction = true;

    return {
        chatActionLabel: DSA5GodsMenuConfig.schipLabel(key),
        chatRollDetails: result.applied.map((a) => `<p><b>${foundry.utils.escapeHTML(a.name)}</b>: +${a.amount} ${cfg.resource}</p>`).join(''),
    };
}

// Schips abziehen

export async function consumeSchip(actor, schipToConsume) {
    if (!schipToConsume) return;
    const amount = schipToConsume.amount || 1;

    switch (schipToConsume.pool) {
        case 'personal':
            for (let i = 0; i < amount; i++) {
                await FateRolls.reduceSchips(actor, FateRolls.SCHIP_SOURCES.PERSONAL, { tossCoin: false });
            }
            break;
        case 'group':
            for (let i = 0; i < amount; i++) {
                await FateRolls.reduceSchips(actor, FateRolls.SCHIP_SOURCES.GROUP, { tossCoin: false });
            }
            break;
        case 'special': {
            const { current } = DSA5GodsMenuConfig.getSpecialSchip(actor, schipToConsume.key);
            await actor.update({ [`flags.dsa5.specialPoints.${schipToConsume.key}.current`]: Math.max(0, current - amount) });
            break;
        }
        case 'master': {
            const { current, max } = DSA5GodsMenuConfig.getSchipSetting('masterschips');
            await DSA5GodsMenuConfig.setSchipSetting('masterschips', current - amount, max);
            break;
        }
    }

    if (schipToConsume.pool !== 'master') {
        await notifyHeroSchipSpent({ actor, pool: schipToConsume.pool, amount });
    }
}
