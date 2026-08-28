import DSA5_Utility from '/systems/dsa5/modules/system/helpers/utility-dsa5.js';
import { FateRolls } from '/systems/dsa5/modules/actor/concerns/faterolls.js';
import DiceDSA5 from '/systems/dsa5/modules/system/rolls/dice-dsa5.js';
import { tabSlider } from '/systems/dsa5/modules/system/helpers/view_helper.js';
import DSA5Dialog from '/systems/dsa5/modules/dialog/dialog-dsa5.js';
import { DSA5GodsMenuConfig } from './config.js'; 
import { promptSchipSwap, promptManualConditions, promptAvesCheat, promptRerollCheat, promptSpecialRollCheat } from './fate-dialogs.js';
import { getDemonConditionRemovals, applyDemonConditionRemovals } from './fate-effects.js';
import { executeReroll, executeDamageReroll, executeAddQS, executeFieserSchaden, executeGescheitert, executeImprove, consumeSchip, throwCoin, processReroll } from './fate-actions.js';
import { buildUnifiedFateContext } from './fate-context.js';
import './temporary-chat-menu-hack.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

export default class UnifiedFateDSA5 extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: 'unified-fate-app',
        classes: ['dsa5'],
        window: { title: 'FateTab.UseSchip', resizable: true },
        position: { width: 570, height: 'auto' },
        actions: {
            toggleDie: function(e, t) { this.#onToggleDie(e, t); },
            toggleDamageDie: function(e, t) { this.#onToggleDamageDie(e, t); },
            toggleImprove: function(e, t) { this.#onToggleImprove(e, t); },
            toggleSpecialDie: function(e, t) { this.#onToggleSpecialDie(e, t); },
            confirm: function(e, t) { this.#onConfirm(e, t, false); }, 
            cheat: function(e, t) { this.#onConfirm(e, t, true); },   
            close: function(e, t) { this.#onClose(e, t); }
        }
    };

    static PARTS = {
        main: {
            template: 'modules/dsa5-godsofaventuria2/templates/unified-fate-dialog.hbs',
            templates: ['systems/dsa5/templates/system/dsatabs.hbs']
        }
    };

    constructor(message, actor, roll, options) {
        super(options);
        this.message = message;
        this.dsaActor = actor;
        this.originalRoll = roll;
        this.selectedForReroll = new Set();
        this.selectedForDamageReroll = new Set();
        this.selectedForImprove = -1;
        this.selectedForSpecialReroll = -1; 
        this.tabGroups = { sheet: 'reroll' };
        
        this.selectedPool = (actor.system.status?.fatePoints?.value > 0) ? 'personal' : 'group'; 
        this.selectedSpecialKey = null;
    }
async _prepareContext(options) {
        const baseContext = await super._prepareContext(options);
        return await buildUnifiedFateContext(this, baseContext);
    }

    async _onRender(context, options) {
        await super._onRender(context, options);
        const html = this.element;
        tabSlider($(html));     

        html.querySelectorAll('.pool-icon').forEach(img => {
            img.addEventListener('click', (ev) => {
                const pool = ev.currentTarget.dataset.pool;
                if (pool === 'special') return;
                
                this.selectedPool = pool;
                this.selectedSpecialKey = null; 
                this.render({ force: true });
            });
        });

        html.querySelectorAll('.schip-btn').forEach(btn => {
            btn.addEventListener('click', (ev) => {
                const target = ev.currentTarget;
                const isSpecial = target.dataset.pool === 'special';
                
                if (isSpecial && target.classList.contains('emptySchip')) {
                    return ui.notifications.warn(game.i18n.localize("ErrorSchipEmpty"));
                }
                
                this.selectedPool = target.dataset.pool;
                this.selectedSpecialKey = isSpecial ? target.dataset.key : null;
                this.render({ force: true });
            });
        });

        html.querySelectorAll('nav.tabs .item').forEach(el => {
            el.addEventListener('click', this._onClickTab.bind(this));
        });
    }

    _onClickTab(event) {
        const nextTab = event.target.closest('[data-tab]')?.dataset.tab;
        if (!nextTab || nextTab === this.tabGroups.sheet) return;
        this.tabGroups.sheet = nextTab;
        
        this.selectedForReroll.clear();
        this.selectedForDamageReroll.clear();
        
        this.render({ force: true });
    }

    #onToggleDie(event, target) {
        const idx = parseInt(target.closest('[data-index]').dataset.index);
        if (this.selectedForReroll.has(idx)) this.selectedForReroll.delete(idx);
        else this.selectedForReroll.add(idx);
        this.render();
    }
	
	#onToggleDamageDie(event, target) {
        const idx = parseInt(target.closest('[data-index]').dataset.index);
        
        if (this.selectedForDamageReroll.has(idx)) {
            this.selectedForDamageReroll.delete(idx);
        } else {
            if (this.tabGroups.sheet === 'rerollDamage') {
                this.selectedForDamageReroll.clear();
            }
            this.selectedForDamageReroll.add(idx);
        }
        this.render();
    }

    #onToggleImprove(event, target) {
        const idx = parseInt(target.closest('[data-index]').dataset.index);
        this.selectedForImprove = (this.selectedForImprove === idx) ? -1 : idx;
        this.render();
    }

    #onToggleSpecialDie(event, target) {
        const idx = parseInt(target.closest('[data-index]').dataset.index);
        this.selectedForSpecialReroll = (this.selectedForSpecialReroll === idx) ? -1 : idx;
        this.render();
    }

    #onClose() {
        this.close();
    }

    async #buildChatContent(actionLabel, rollDetails = '', specialRollHtml = '', finalSchipPool = null, finalSchipKey = null, isConsumed = true, consumedAmount = 1) {
        const { godListNames, godIconMap, demonIconMap } = DSA5GodsMenuConfig;
        let max = 0; let available = 0; let tooltip = ''; let iconPath = '';

        const displayPool = finalSchipPool || this.selectedPool;
        const displayKey = finalSchipKey || this.selectedSpecialKey;
        const consumedMod = isConsumed ? consumedAmount : 0; 

        // Standard-Texte (für Spieler)
        let actorName = this.dsaActor.name;
        let actionText = game.i18n.localize("CHATFATE.usesPointFor");

        if (displayPool === 'personal') {
            max = this.dsaActor.system.status.fatePoints.current || 0;
            available = Math.max(0, (this.dsaActor.system.status.fatePoints.value || 0) - consumedMod);
            tooltip = game.i18n.localize("FateTab.FatePoint");
        } else if (displayPool === 'group') {
            const raw = game.settings.get('dsa5', 'groupschips') || "0/0";
            const [cur, m] = raw.split('/').map(Number);
            max = m || cur || 0;
            available = Math.max(0, cur - consumedMod);
            tooltip = game.i18n.localize("FateTab.GroupFatePoint");
        } else if (displayPool === 'special' && displayKey) {
            const path = `flags.dsa5.specialPoints.${displayKey}`;
            const sData = foundry.utils.getProperty(this.dsaActor, path);
            max = sData?.value || 0;
            available = Math.max(0, (sData?.current || 0) - consumedMod);
            
            let isGod = godListNames.includes(displayKey);
            let iconName = isGod ? (godIconMap[displayKey] || "Alveran.png") : (demonIconMap[displayKey] || "Erzdaemonen.png");
            iconPath = `modules/dsa5-godsofaventuria2/icons/chips/${iconName}`;
            tooltip = `${game.i18n.localize(isGod ? `God.${displayKey}.Name` : `Demon.${displayKey}.Name`)}-Schip`;
        } else if (displayPool === 'master') {
            // Meister-Schips-Logik
            const raw = game.settings.get('dsa5', 'masterschips') || "0/0";
            const [cur, m] = raw.split('/').map(Number);
            max = m || cur || 0;
            available = Math.max(0, cur - consumedMod);
            tooltip = game.i18n.localize("FateTab.MasterFate") || "Meister-Schip";
            
            actorName = game.i18n.has("Gamemaster") ? game.i18n.localize("Gamemaster") : "Der Spielleiter";
            actionText = game.i18n.has("FateTab.MasterUsesPointFor") ? game.i18n.localize("FateTab.MasterUsesPointFor") : "nutzt Meister-Schicksal für";
        }

        let schips = [];
        for (let i = 0; i < max; i++) {
            const isFull = i < available;
            let iconStyle = '';
            
            if (displayPool === 'special' && iconPath) {
                iconStyle = `background-image: url('${iconPath}'); background-size: contain; background-repeat: no-repeat; background-position: center;`;
                if (!isFull) iconStyle += ` filter: grayscale(100%) opacity(0.4);`;
            } else if (displayPool === 'master') {
                const mPath = isFull ? 'systems/dsa5/icons/meisterschip.webp' : 'systems/dsa5/icons/gray_meisterschip.webp';
                iconStyle = `background-image: url('${mPath}'); background-size: contain; background-repeat: no-repeat; background-position: center; border-radius: 100%;`;
            }
            schips.push({ cssClass: isFull ? 'fullSchip' : 'emptySchip', iconStyle });
        }

        const templateData = {
            actorName,
            actionText,
            actionLabel,
            tooltip,
            schips,
            specialRollHtml,
            rollDetails
        };
        
        return await renderTemplate('modules/dsa5-godsofaventuria2/templates/chat-action-card.hbs', templateData);
    }

    async #onConfirm(event, target, isCheat = false) {
        const data = this.message.flags.data;
        const newTestData = data.preData; 
        const originalRollData = this.originalRoll.toJSON();

        if (this.tabGroups.sheet.startsWith('specialAction_')) {
            this.selectedPool = 'special';
            this.selectedSpecialKey = this.tabGroups.sheet.replace('specialAction_', '');
        }
        
        // Sicherheitsprüfungen
        if (this.selectedPool === 'personal' && this.dsaActor.system.status.fatePoints.value <= 0) return ui.notifications.error(game.i18n.localize("ErrorNoPersonalSchips"));
        if (this.selectedPool === 'group' && Number((game.settings.get('dsa5', 'groupschips')||"0/0").split('/')[0]) <= 0) return ui.notifications.error(game.i18n.localize("ErrorNoGroupSchips"));
        if (this.selectedPool === 'special' && !this.selectedSpecialKey) return ui.notifications.error(game.i18n.localize("ErrorNoSpecialSchipSelected"));
        
        if (this.selectedPool === 'special' && this.selectedSpecialKey) {
            const currentVal = foundry.utils.getProperty(this.dsaActor, `flags.dsa5.specialPoints.${this.selectedSpecialKey}.current`) || 0;
            if (currentVal <= 0) return ui.notifications.error(game.i18n.localize("ErrorSpecialSchipEmpty"));

            const isGod = DSA5GodsMenuConfig.godListNames.includes(this.selectedSpecialKey);
            if (isGod && this.selectedSpecialKey !== "Namenloser") {
                const namelessTraditionName = game.i18n.localize("Tradition (Nameless One)");
                const hasDemonMark = this.dsaActor.items.some(i => i.type === "demonmark");
                const hasNamelessTradition = this.dsaActor.items.some(i => i.name === namelessTraditionName);

                if (hasDemonMark || hasNamelessTradition) {
                    if (hasDemonMark) ui.notifications.error(game.i18n.format("DämonenpaktiererError", { name: this.dsaActor.name }));
                    else ui.notifications.error(game.i18n.format("NamenloserKultistError", { name: this.dsaActor.name }));
                    return;
                }
            }
        }
        
        let executeEffect = true;
        let schipToConsume = { pool: this.selectedPool, key: this.selectedSpecialKey };
        let specialRollHtml = "";
        let conditionsToRemove = [];
        let manualRemovals = [];
        let manualReductions = {};

        const isSpecialAction = this.tabGroups.sheet.startsWith('specialAction_');
        const { godListNames, diceIconMap } = DSA5GodsMenuConfig;

        // Münzwurf
        let coinRoll = await throwCoin();

        // Götter / Dämonen 2W6 Wurf
        if (this.selectedPool === 'special') {
            const isGod = godListNames.includes(this.selectedSpecialKey);
            const sym1Name = isGod ? game.i18n.localize("GodSymbol") : game.i18n.localize("DemonSymbol");
            const sym2Name = isGod ? game.i18n.localize("KhaSymbol") : game.i18n.localize("StarWallSymbol");
            
            const d1IconName = diceIconMap[this.selectedSpecialKey] || (isGod ? 'Kha.png' : 'Sternenwall.png');
            const d2IconName = isGod ? 'Kha.png' : 'Sternenwall.png';
            
            const tooltip1 = game.i18n.localize(isGod ? "FateTab.GodDie" : "FateTab.DemonDie");
            const tooltip2 = game.i18n.localize(isGod ? "FateTab.KhaDie" : "FateTab.StarwallDie");

            let roll = await new Roll('1d6 + 1d6').evaluate();
            let d1, d2;

            if (isCheat) {
                const title = game.i18n.localize("FateTab.SpecialRollTitle");
                const icon1 = `modules/dsa5-godsofaventuria2/icons/dice/${d1IconName}`;
                const icon2 = `modules/dsa5-godsofaventuria2/icons/dice/${d2IconName}`;
                const cheatResult = await promptSpecialRollCheat(title, icon1, tooltip1, icon2, tooltip2);
                if (cheatResult === null) {
                    ui.notifications.warn(game.i18n.localize("FateTab.ActionCancelled"));
                    return this.close();
                }
                d1 = cheatResult.d1;
                d2 = cheatResult.d2;
                
                roll.terms[0].results[0].result = d1;
                roll.terms[2].results[0].result = d2;
                roll._total = d1 + d2;
            } else {
                d1 = roll.terms[0].results[0].result;
                d2 = roll.terms[2].results[0].result;
            }
            
            await DiceDSA5.showDiceSoNice(roll, game.settings.get("core", "messageMode"));

            let die1Img = (d1 === 6) ? `modules/dsa5-godsofaventuria2/icons/dice/${d1IconName}` : null;
            let die2Img = (d2 === 6) ? `modules/dsa5-godsofaventuria2/icons/dice/${d2IconName}` : null;
            
            let resultTitle = "";
            let resultDesc = "";
            let resultColor = "black";

            if ((d1 === 6) && (d2 === 6)) {
                schipToConsume = null;
                resultColor = "darkgreen";
                resultTitle = game.i18n.localize("FateTab.SpecialRollSuccessTitle");
                resultDesc = game.i18n.localize("FateTab.SpecialRollSuccessDesc");
            } else if ((d1 === 6) && !(d2 === 6)) {
                if (this.selectedSpecialKey === "Phex") {
                    schipToConsume = null;
                    resultColor = "darkgreen";
                    resultTitle = game.i18n.localize("FateTab.PhexRefundTitle");
                    resultDesc = game.i18n.localize("FateTab.PhexRefundDesc");
                } else {
                    schipToConsume = await promptSchipSwap(this.dsaActor, this.selectedSpecialKey, isGod);
                    if (schipToConsume === null) {
                        ui.notifications.warn(game.i18n.localize("FateTab.ActionCancelled"));
                        return;
                    }
                    resultColor = "darkblue";
                    resultTitle = game.i18n.localize("FateTab.SpecialRollFlexibleTitle");
                    resultDesc = game.i18n.localize("FateTab.SpecialRollFlexibleDesc");
                }
            } else if (!(d1 === 6) && (d2 === 6)) {
                executeEffect = false;
                schipToConsume = null;
                resultColor = "darkred";
                resultTitle = game.i18n.localize("FateTab.SpecialRollBlockedTitle");
                resultDesc = game.i18n.localize("FateTab.SpecialRollBlockedDesc");
            } else {
                resultTitle = game.i18n.localize("FateTab.SpecialRollNormalTitle");
                resultDesc = game.i18n.localize("FateTab.SpecialRollNormalDesc");
            }

            specialRollHtml = await renderTemplate('modules/dsa5-godsofaventuria2/templates/special-roll-result.hbs', {
                die1Img, die2Img,
                d1Val: d1, d2Val: d2,
                die1Tooltip: sym1Name, die2Tooltip: sym2Name,
                resultTitle, resultDesc, resultColor
            });

            if (executeEffect && this.selectedSpecialKey && isSpecialAction) {
                const removals = getDemonConditionRemovals(this.selectedSpecialKey);
                conditionsToRemove.push(...removals.autoConditions);
                manualRemovals.push(...removals.manualRemovals);
            }
        }

        let avesCoinHtml = "";
        let avesDouble = false;
        if (executeEffect && this.selectedPool === 'special' && this.selectedSpecialKey === "Aves") {
            if (isCheat) {
                const cheatResult = await promptAvesCheat();
                if (cheatResult === null) {
                    ui.notifications.warn(game.i18n.localize("FateTab.ActionCancelled"));
                    return; 
                }
                coinRoll.terms[0].results[0].result = cheatResult;
                coinRoll._total = cheatResult;
            }
            
            avesDouble = (coinRoll.total === 1);
            const avesIconName = DSA5GodsMenuConfig.godIconMap?.["Aves"] || "Aves.png";
            
            avesCoinHtml = await renderTemplate('modules/dsa5-godsofaventuria2/templates/aves-coin-result.hbs', {
                actorName: this.dsaActor.name,
                avesImg: `modules/dsa5-godsofaventuria2/icons/chips/${avesIconName}`,
                isSuccess: avesDouble,
                resultTitle: game.i18n.localize(avesDouble ? "FateTab.AvesHeadTitle" : "FateTab.AvesTailTitle"),
                resultDesc: game.i18n.localize(avesDouble ? "FateTab.AvesHeadDesc" : "FateTab.AvesTailDesc")
            });
        }

        if (executeEffect && isSpecialAction && manualRemovals.includes("3 beliebige Zustandsstufen")) {
            let availableConditions = [];
            for (let e of this.dsaActor.effects) {
                let statusId = Array.from(e.statuses)[0];
                if (statusId && !conditionsToRemove.includes(statusId)) {
                    let val = e.system?.condition?.value || e.getFlag("dsa5", "value") || 1;
                    availableConditions.push({ id: statusId, name: e.name, value: val, img: e.img || e.icon });
                }
            }

            if (availableConditions.length > 0) {
                const result = await promptManualConditions(this.dsaActor, availableConditions);
                if (result === null) {
                    ui.notifications.warn(game.i18n.localize("FateTab.ActionCancelled"));
                    return; 
                } else {
                    manualReductions = result;
                }
            }
        }

        if (!executeEffect) {
            const chatContent = await this.#buildChatContent("---", "", specialRollHtml, this.selectedPool, this.selectedSpecialKey, false);
            await ChatMessage.create(DSA5_Utility.chatDataSetup(chatContent));
            return this.close();
        }

        // Optionen
        const cardOptions = {
            flags: { img: { src: this.message.flags.img?.src } },
            messageMode: data.messageMode,
            speaker: this.message.speaker,
            template: data.template,
            title: data.title,
            user: this.message.author,
            messageId: this.message.id 
        };

        let chatActionLabel = "";
        let chatRollDetails = "";
        let flagToUpdate = [];
        let specialRollsText = [];

        const isMasterReroll = this.tabGroups.sheet === 'meisterschicksal';
        const isMasterDamageReroll = this.tabGroups.sheet === 'beistand';
        const isDamageContext = this.tabGroups.sheet === 'rerollDamage' || isMasterDamageReroll || this.tabGroups.sheet === 'fieser';

        const optionalProps = ['attackerMessage', 'defenderMessage', 'unopposedStartMessage', 'startMessagesList'];
        optionalProps.forEach(prop => { if (data[prop]) cardOptions[prop] = data[prop]; });

        if (isDamageContext) {
            if (typeof DSA5_Utility.clearUserTargets === 'function') {
                DSA5_Utility.clearUserTargets();
            } else {
                game.user.targets.forEach(target => target.setTarget(false, { user: game.user, releaseOthers: false, groupSelection: true }));
            }
        } else {
            if (data.originalTargets?.size) { 
                game.user.targets = data.originalTargets; 
                game.user.targets.user = game.user; 
            }
        }


        // Router an Fate-Actions
        if (this.tabGroups.sheet === 'reroll' || isMasterReroll) {
            const result = await executeReroll(this, data, newTestData, isCheat, isMasterReroll);
            if (!result) return this.close();
            chatActionLabel = result.chatActionLabel;
            chatRollDetails = result.chatRollDetails;
            flagToUpdate.push(result.flagToUpdate);
            if (isMasterReroll) schipToConsume = { pool: 'master' };
        } 
        else if (this.tabGroups.sheet === 'rerollDamage' || isMasterDamageReroll) {
            const result = await executeDamageReroll(this, data, newTestData, isCheat, isMasterDamageReroll);
            if (!result) return this.close();
            chatActionLabel = result.chatActionLabel;
            chatRollDetails = result.chatRollDetails;
            if (result.flagToUpdate) flagToUpdate.push(result.flagToUpdate);
            if (isMasterDamageReroll) schipToConsume = { pool: 'master' };
        }
        else if (this.tabGroups.sheet === 'addQS') {
            const result = await executeAddQS(this, newTestData, cardOptions, avesDouble);
            chatActionLabel = result.chatActionLabel;
            chatRollDetails = result.chatRollDetails;
            flagToUpdate.push(result.flagToUpdate);
        }
        else if (this.tabGroups.sheet === 'fieser') {
            const result = await executeFieserSchaden(this, data, newTestData, isCheat);
            if (!result) return this.close();
            chatActionLabel = result.chatActionLabel;
            chatRollDetails = result.chatRollDetails;
            flagToUpdate.push(result.flagToUpdate);
            schipToConsume = { pool: 'master' };
        }
        else if (this.tabGroups.sheet === 'gescheitert') {
            const result = await executeGescheitert(this, data, cardOptions);
            chatActionLabel = result.chatActionLabel;
            chatRollDetails = result.chatRollDetails;
            schipToConsume = { pool: 'master', amount: result.cost };
        }
        else if (this.tabGroups.sheet === 'improve' || this.tabGroups.sheet.startsWith('specialAction_')) {
            const result = await executeImprove(this, data, newTestData, isCheat, cardOptions, avesDouble);
            if (!result) return this.close();
            chatActionLabel = result.chatActionLabel;
            flagToUpdate.push(...result.flagsToUpdate);
            specialRollsText = result.specialRollsText;
        }

        // System updates & Chatkarte
        if (!cardOptions.skipNativePostFunction) {
            await this.dsaActor[data.postData.postFunction]({ testData: newTestData, cardOptions }, { rerenderMessage: this.message });
        } else if (this.tabGroups.sheet === 'gescheitert') {
            const renderData = { testData: data.postData, preData: data.preData, hideData: data.hideData, hideDamage: data.hideDamage };
            const html = await renderTemplate(data.template, renderData);
            await this.message.update({ content: html, "flags.data": data });
        }
        
        const updatedMessage = game.messages.get(this.message.id);
        const isSuccessful = updatedMessage?.flags?.data?.postData?.successLevel > 0;

        if (avesCoinHtml) chatRollDetails += avesCoinHtml;

        if (isSpecialAction) {
            if (specialRollsText.length > 0) {
                if (typeof FateRolls.formatDieChangesHtml === 'function') {
                    chatRollDetails += FateRolls.formatDieChangesHtml(specialRollsText);
                } else {
                    chatRollDetails += `<p><b>${game.i18n.localize('FateTab.Reroll')}</b>: ${specialRollsText.join(', ')}</p>`;
                }
            }
            if (isSuccessful && flagToUpdate.includes(FateRolls.FLAGS.FATE_ADD_QS)) {
                chatRollDetails += `<p><b>${game.i18n.localize('FateTab.AddQS')}</b>: +2 QS</p>`;
            }
        }

        const finalPool = schipToConsume ? schipToConsume.pool : this.selectedPool;
        const finalKey = schipToConsume ? schipToConsume.key : this.selectedSpecialKey;
        const isConsumed = schipToConsume !== null;
        const consumedAmount = schipToConsume?.amount || 1;
        const chatContent = await this.#buildChatContent(chatActionLabel, chatRollDetails, specialRollHtml, finalPool, finalKey, isConsumed, consumedAmount);
        await ChatMessage.create(DSA5_Utility.chatDataSetup(chatContent));

        let updates = {};
        flagToUpdate.forEach(f => updates[`flags.data.${f}`] = true);

        if (executeEffect && isSpecialAction && this.selectedSpecialKey) {
            const currentSpecials = data.fateSpecialUsed || [];
            if (!currentSpecials.includes(this.selectedSpecialKey)) {
                currentSpecials.push(this.selectedSpecialKey);
                updates['flags.data.fateSpecialUsed'] = currentSpecials;
            }
        }

        if (Object.keys(updates).length > 0) await updatedMessage.update(updates);

        // Schips verbrauchen
        await consumeSchip(this.dsaActor, schipToConsume);

        // Dämonen Statusabbau
        if (executeEffect && this.selectedPool === 'special' && isSpecialAction) {
            await applyDemonConditionRemovals(this.dsaActor, conditionsToRemove, manualReductions);
        }

        // Aves Doppelwurf
        if (avesDouble && this.tabGroups.sheet === 'reroll') {
            const html = await renderTemplate('systems/dsa5/templates/dialog/fateReroll-dialog.hbs', {
                testData: data.preData, 
                postData: data.postData,
                singleDie: data.postData.characteristics?.length === 1
            });
            
            class AvesRerollDialogV2 extends foundry.applications.api.DialogV2 {
                _onRender(context, options) {
                    super._onRender(context, options);
                    this.element.querySelectorAll('[data-index]').forEach(el => {
                        el.style.cursor = 'pointer';
                        el.addEventListener('click', (ev) => ev.currentTarget.classList.toggle('dieSelected'));
                    });
                }
            }
            
            const diesToReroll = await AvesRerollDialogV2.wait({
                window: { title: game.i18n.localize("FateTab.AvesHeadTitle") + " " + game.i18n.localize('CHATFATE.selectDice') },
                content: html,
                rejectClose: false,
                buttons: [
                    { action: 'yes', icon: 'fa-solid fa-check', label: 'OK', callback: (ev, btn, app) => Array.from(app.element.querySelectorAll('.dieSelected')).map(el => Number(el.dataset.index)) },
                    { action: 'cancel', icon: 'fa-solid fa-times', label: 'Cancel', callback: () => null }
                ]
            });

            if (diesToReroll && diesToReroll.length > 0) {
                const isPhex = this.dsaActor.items.some(item => item.type === 'specialability' && item.name === game.i18n.localize('LocalizedIDs.traditionPhex'));
                const rerollData = await processReroll(diesToReroll, newTestData, data.postData, 'CHATCONTEXT.Reroll', false, this.dsaActor, isPhex, isCheat);
                
                if (!rerollData) {
                    ui.notifications.warn(game.i18n.localize("FateTab.ActionCancelled"));
                    return this.close();
                }
                
                newTestData.fateUsed = true;
                await this.dsaActor[data.postData.postFunction]({ testData: newTestData, cardOptions }, { rerenderMessage: this.message });
                
                let avesRollDetails = typeof FateRolls.formatDieChangesHtml === 'function' ? FateRolls.formatDieChangesHtml(rerollData.changedRollsHtml) : `<p><b>${game.i18n.localize('Roll')}</b>: ${rerollData.changedRollsText.join(', ')}</p>`;
                const finalInfoMsg = `<h5 class="center"><b>${game.i18n.localize("FateTab.AvesHeadTitle")} (2. Wurf)</b></h5>${avesRollDetails}`;
                await ChatMessage.create(DSA5_Utility.chatDataSetup(finalInfoMsg));
            }
        }

        this.close();
    }
}
