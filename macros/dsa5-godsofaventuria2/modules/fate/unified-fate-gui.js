import { DSA5GodsMenuConfig } from './config.js';
import { promptManualConditions, promptAvesCheat, promptAvesDamageReroll } from './fate-dialogs.js';
import { getDemonConditionRemovals, applyDemonConditionRemovals, applyXeledonRollUpdate } from './fate-effects.js';
import { isBlockedFromGodSchips, rollSpecialSchipSymbols, buildFateChatContent, executeReroll, executeDamageReroll, executeAddQS, executeXeledonSubQS, executeFieserSchaden, executeGescheitert, executeImprove, executeMasterRegen, prepareRegenBlessing, executeRegenBlessing, consumeSchip, processReroll, processDamageReroll } from './fate-actions.js';
import { DSA5_Utility, FateRolls, UnifiedFateDSA5 } from './dsa5-api.js';
import { buildUnifiedFateContext, buildRollRequestFateContext, buildActorPickerFateContext, buildExternalXeledonFateContext, extractDamageDice, getRegenBlessingActors, getXeledonCandidateActors, getRollCardSwitchActors, FATE_TAB_LABELS, STANDARD_FATE_TABS, STANDARD_ONLY_SPECIAL_KEYS } from './fate-context.js';
import './fate-chat-menu.js';

const { renderTemplate } = foundry.applications.handlebars;

export default class GodsFateDSA5 extends UnifiedFateDSA5 {
    #isConfirming = false;
    selectedForMasterRegen = -1;
    speakerActor = null;

    #onLiveSync = (doc) => {
        if (!this.rendered || this.#isConfirming) return;
        if (doc.id !== this.message?.id && doc.id !== this.dsaActor?.id) return;

        if (this.isRollRequest) {
            if (!getRegenBlessingActors(this.message).length) {
                this.close();
                return;
            }
            this.render();
            return;
        }

        if (this.isExternalXeledon && !getRollCardSwitchActors(this.message, this.targetActor).some((a) => a.id === this.dsaActor?.id)) {
            if (!game.user.isGM && !this.targetActor?.isOwner) {
                this.close();
                return;
            }
            this.dsaActor = this.targetActor;
            this.selectedPool = 'personal';
            this.selectedSpecialKey = null;
            this.tabGroups.sheet = '';
        }
        this.render();
    };

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.deepClone(UnifiedFateDSA5.DEFAULT_OPTIONS),
        {
            actions: {
                toggleMasterRegenDie: function (e, t) { this._onToggleMasterRegenDie(e, t); },
                openChar: function () { this.dsaActor?.sheet?.render(true); },
                quickSelectActor: function (e, t) { this._onQuickSelectActor(e, t); },
                unselectActor: function () { this._onUnselectActor(); },
            },
        },
    );

    static PARTS = {
        main: {
            template: DSA5GodsMenuConfig.templatePath('fate/unified-fate-dialog.hbs'),
            templates: [
                'systems/dsa5/templates/system/dsatabs.hbs',
                DSA5GodsMenuConfig.templatePath('fate/header.hbs'),
            ],
        },
    };

    static {
        Hooks.on('dsa5.getFateSpendApp', (registry) => {
            registry.AppClass = this;
        });
    }

    static openForRollRequest(message) {
        const eligibleActors = getRegenBlessingActors(message);
        if (!eligibleActors.length) return;

        let initialActor = null;
        if (eligibleActors.length === 1) {
            initialActor = eligibleActors[0];
        } else if (!game.user.isGM) {
            const userChar = game.user.character;
            if (userChar && eligibleActors.some((a) => a.id === userChar.id)) initialActor = userChar;
        } else {
            const controlled = canvas?.tokens?.controlled?.[0]?.actor;
            if (controlled && eligibleActors.some((a) => a.id === controlled.id)) initialActor = controlled;
        }

        const app = new this(message, initialActor || eligibleActors[0]);
        app.dsaActor = initialActor;
        app.selectedPool = 'special';
        return app.render(true);
    }

    static openForXeledon(message) {
        const candidates = getXeledonCandidateActors(message);
        if (!candidates.length) return;

        let initialActor = null;
        if (candidates.length === 1) {
            initialActor = candidates[0];
        } else if (game.user.character && candidates.some((a) => a.id === game.user.character.id)) {
            initialActor = game.user.character;
        }

        const app = new this(message, initialActor || candidates[0]);
        app.speakerActor = ChatMessage.getSpeakerActor(message.speaker);
        app.dsaActor = initialActor;
        app.selectedPool = 'special';
        app.selectedSpecialKey = 'Xeledon';
        return app.render(true);
    }

    get isRollRequest() {
        return !!this.message?.flags?.dsa5?.rollRequest && !this.message?.flags?.data?.preData;
    }

    get targetActor() {
        return this.speakerActor || ChatMessage.getSpeakerActor(this.message?.speaker);
    }

    get isExternalXeledon() {
        return !this.isRollRequest && !!this.dsaActor && !!this.targetActor && this.dsaActor.uuid !== this.targetActor.uuid;
    }

    async _prepareContext(options) {
        if (this.isRollRequest) return buildRollRequestFateContext(this);
        if (!this.speakerActor) this.speakerActor = this.dsaActor || ChatMessage.getSpeakerActor(this.message?.speaker);
        if (!this.dsaActor) return buildActorPickerFateContext(this);
        if (this.isExternalXeledon) return buildExternalXeledonFateContext(this);

        const context = await super._prepareContext(options);
        context.showFateBody = true;
        return context;
    }

    async _buildFateContext(baseContext) {
        return buildUnifiedFateContext(this, baseContext);
    }

    async _onFirstRender(context, options) {
        await super._onFirstRender(context, options);
        Hooks.on('updateChatMessage', this.#onLiveSync);
        Hooks.on('updateActor', this.#onLiveSync);
    }

    async _onClose(options) {
        Hooks.off('updateChatMessage', this.#onLiveSync);
        Hooks.off('updateActor', this.#onLiveSync);
        return super._onClose(options);
    }

    #resetSelections() {
        this.selectedForReroll?.clear?.();
        this.selectedForDamageReroll?.clear?.();
        this.selectedForImprove = -1;
        this.selectedForSpecialReroll = -1;
        this.selectedForMasterRegen = -1;
    }

    _onQuickSelectActor(event, target) {
        if (this.#isConfirming) return;
        const actorId = target.dataset.actorId;

        if (this.isRollRequest) {
            const actor = getRegenBlessingActors(this.message).find((a) => a.id === actorId);
            if (!actor) return;
            this.dsaActor = actor;
            this.selectedPool = 'special';
            this.selectedSpecialKey = null;
            this.tabGroups.sheet = '';
            this.render();
            return;
        }

        const actor = getRollCardSwitchActors(this.message, this.targetActor).find((a) => a.id === actorId);
        if (!actor) return;
        this.dsaActor = actor;
        this.#resetSelections();
        this.tabGroups.sheet = '';

        if (this.isExternalXeledon) {
            this.selectedPool = 'special';
            this.selectedSpecialKey = 'Xeledon';
        } else {
            this.selectedPool = 'personal';
            this.selectedSpecialKey = null;
        }
        this.render();
    }

    _onUnselectActor() {
        if (this.#isConfirming) return;
        this.dsaActor = null;
        this.selectedSpecialKey = null;
        this.tabGroups.sheet = '';
        this.#resetSelections();
        this.render();
    }

    _canSelectPool(pool, key) {
        if (pool === 'special') return !!key;
        if (this.isRollRequest || this.isExternalXeledon) return false;
        return ['personal', 'group', 'master'].includes(pool);
    }

    _onSchipButtonClick(target) {
        if (target.dataset.pool === 'special' && target.classList.contains('emptySchip')) {
            return ui.notifications.warn(_loc('DSAError.schipEmpty'));
        }
        if (this.isRollRequest && target.dataset.pool === 'special' && target.dataset.key) {
            this.tabGroups.sheet = `regenBlessing_${target.dataset.key}`;
        }
        return super._onSchipButtonClick(target);
    }

    _onToggleSpecialDie(event, target) {
        const idx = parseInt(target.closest('[data-index]').dataset.index, 10);
        this.selectedForSpecialReroll = this.selectedForSpecialReroll === idx ? -1 : idx;
        this.render();
    }

    _onToggleMasterRegenDie(event, target) {
        const idx = parseInt(target.closest('[data-index]').dataset.index, 10);
        this.selectedForMasterRegen = this.selectedForMasterRegen === idx ? -1 : idx;
        this.render();
    }

    _validateDieSelection() {
        const tab = this.tabGroups.sheet;
        if (tab === 'noOption' || tab === 'masterPlaceholder') {
            ui.notifications.warn(_loc('GodsMenu.FateTab.NoOptionNotify'));
            return false;
        }
        if (tab.startsWith('specialAction_') || tab.startsWith('regenBlessing_') || tab === 'xeledon_addQS') return true;
        if (tab === 'meisterschicksal' || tab === 'xeledon_reroll') return this.selectedForReroll.size > 0 || this._warnNoDieSelected();
        if (tab === 'beistand' || tab === 'xeledon_rerollDamage') return this.selectedForDamageReroll.size > 0 || this._warnNoDieSelected();
        if (tab === 'meisterRegen') return this.selectedForMasterRegen >= 0 || this._warnNoDieSelected();
        return super._validateDieSelection();
    }

    _validateSelectedPool() {
        if (!this.dsaActor) return false;
        if (this.selectedPool === 'master') return true;
        if (this.selectedPool === 'special') {
            if (!this.selectedSpecialKey) {
                ui.notifications.error(_loc('DSAError.noSpecialSchipSelected'));
                return false;
            }
            const currentVal = foundry.utils.getProperty(this.dsaActor, `flags.dsa5.specialPoints.${this.selectedSpecialKey}.current`) || 0;
            if (currentVal <= 0) {
                ui.notifications.error(_loc('DSAError.specialSchipEmpty'));
                return false;
            }
            return !isBlockedFromGodSchips(this.dsaActor, this.selectedSpecialKey);
        }
        return super._validateSelectedPool();
    }

    async _onConfirm(event, target, isCheat = false) {
        event?.preventDefault?.();
        if (this.#isConfirming) return;
        this.#isConfirming = true;

        const lockedButtons = Array.from(
            this.element.querySelectorAll('button[data-action="confirm"], button[data-action="cheat"]'),
        ).filter((btn) => !btn.disabled);
        lockedButtons.forEach((btn) => { btn.disabled = true; });

        try {
            if (this.tabGroups.sheet.startsWith('specialAction_') || this.tabGroups.sheet.startsWith('regenBlessing_')) {
                this.selectedPool = 'special';
                this.selectedSpecialKey = this.tabGroups.sheet.split('_')[1];
            } else if (this.tabGroups.sheet.startsWith('xeledon_')) {
                this.selectedPool = 'special';
                this.selectedSpecialKey = 'Xeledon';
            }
            if (this.selectedPool === 'special' || this.selectedPool === 'master') {
                return await this.#onGodsConfirm(event, target, isCheat);
            }
            return await super._onConfirm(event, target, isCheat);
        } finally {
            this.#isConfirming = false;
            if (this.rendered) lockedButtons.forEach((btn) => { btn.disabled = false; });
        }
    }

    #attemptedActionLabel() {
        const tab = this.tabGroups.sheet;
        if (tab.startsWith('specialAction_') || tab.startsWith('regenBlessing_')) {
            const key = tab.split('_')[1];
            return `${_loc('GodsMenu.FateTab.SpecialSchipAction')} [${DSA5GodsMenuConfig.schipName(key)}]`;
        }
        if (tab.startsWith('xeledon_')) {
            const baseKey = tab.replace('xeledon_', '');
            return `${_loc(FATE_TAB_LABELS[baseKey])} (Xeledon)`;
        }
        return FATE_TAB_LABELS[tab]
            ? _loc(FATE_TAB_LABELS[tab])
            : this.element.querySelector(`.sheet-tabs .item[data-tab="${tab}"]`).textContent.trim();
    }

    #syncStandardOnlySchipGlow() {
        if (this.isRollRequest || this.isExternalXeledon) return;
        const isStandard = STANDARD_FATE_TABS.has(this.tabGroups?.sheet);
        const rollName = this.message?.flags?.data?.preData?.source?.name || '';

        for (const key of STANDARD_ONLY_SPECIAL_KEYS) {
            const isRelevant = isStandard && (
                DSA5GodsMenuConfig.isQsAndReroll(key, rollName)
                || DSA5GodsMenuConfig.isExtraReroll(key, rollName)
            );
            this.element?.querySelectorAll(`.special-schip[data-key="${key}"].fullSchip`).forEach((btn) => {
                btn.classList.toggle('special-schip-relevant', isRelevant);
            });
        }
    }

    async _onRender(context, options) {
        await super._onRender(context, options);
        this.#syncStandardOnlySchipGlow();
    }

    _onClickTab(event) {
        super._onClickTab(event);
        this.selectedForMasterRegen = -1;
        if (this.isRollRequest && this.tabGroups.sheet?.startsWith('regenBlessing_')) {
            const key = this.tabGroups.sheet.replace('regenBlessing_', '');
            this.selectedSpecialKey = key;
            this.element.querySelectorAll('.special-schip').forEach((btn) => {
                btn.classList.toggle('schip-selected', btn.dataset.key === key);
            });
        }
        this.#syncStandardOnlySchipGlow();
    }

    async #preparePreRollInputs(isSpecialAction, isRegenBlessing, isXeledon) {
        let regenAllocations = null;
        const conditionsToRemove = [];
        let manualReductions = {};

        if (isXeledon) {
            if ((this.message.flags?.data?.fateSpecialUsed || []).includes('Xeledon')) {
                ui.notifications.warn(_loc('GodsMenu.FateTab.XeledonAlreadyUsed'));
                return null;
            }
            if (!game.user.isGM && (!this.message.isOwner || !this.targetActor?.isOwner) && !game.users.activeGM) {
                ui.notifications.error(_loc('GodsMenu.FateTab.XeledonNoGM'));
                return null;
            }
        }

        if (isRegenBlessing) {
            regenAllocations = await prepareRegenBlessing(this, this.selectedSpecialKey);
            if (!regenAllocations) return null;
        }

        if (this.selectedPool === 'special' && this.selectedSpecialKey && isSpecialAction) {
            const removals = getDemonConditionRemovals(this.selectedSpecialKey);
            conditionsToRemove.push(...removals.autoConditions);

            if (removals.manualLevels > 0) {
                const availableConditions = [];
                for (const effect of this.dsaActor.effects) {
                    const statusId = Array.from(effect.statuses)[0];
                    if (statusId && !conditionsToRemove.includes(statusId)) {
                        const val = effect.system?.condition?.value || effect.getFlag('dsa5', 'value') || 1;
                        availableConditions.push({ id: statusId, name: effect.name, value: val, img: effect.img || effect.icon });
                    }
                }

                if (availableConditions.length > 0) {
                    const result = await promptManualConditions(this.dsaActor, availableConditions, removals.manualLevels);
                    if (result === null) {
                        ui.notifications.warn(_loc('GodsMenu.FateTab.ActionCancelled'));
                        return null;
                    }
                    manualReductions = result;
                }
            }
        }

        return { regenAllocations, conditionsToRemove, manualReductions };
    }

    async #handleAvesCoin(coinRoll, isCheat) {
        if (
            this.selectedPool !== 'special'
            || this.selectedSpecialKey !== 'Aves'
            || !STANDARD_FATE_TABS.has(this.tabGroups?.sheet)
        ) {
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
            actorName: this.dsaActor.name,
            avesImg: DSA5GodsMenuConfig.chipIcon('Aves'),
            isSuccess: avesDouble,
            resultTitle: _loc(avesDouble ? 'GodsMenu.FateTab.AvesHeadTitle' : 'GodsMenu.FateTab.AvesTailTitle'),
            resultDesc: _loc(avesDouble ? 'GodsMenu.FateTab.AvesHeadDesc' : 'GodsMenu.FateTab.AvesTailDesc'),
        });

        return { avesDouble, avesCoinHtml };
    }

    async #handleAvesSecondReroll(data, newTestData, cardOptions, isCheat) {
        const html = await renderTemplate('systems/dsa5/templates/dialog/fateReroll-dialog.hbs', {
            testData: data.preData,
            postData: data.postData,
            singleDie: data.postData.characteristics?.length === 1,
        });

        class AvesRerollDialogV2 extends foundry.applications.api.DialogV2 {
            _onRender(context, options) {
                super._onRender(context, options);
                this.element.querySelectorAll('[data-index]').forEach((el) => {
                    el.style.cursor = 'pointer';
                    el.addEventListener('click', (ev) => ev.currentTarget.classList.toggle('dieSelected'));
                });
            }
        }

        const diesToReroll = await AvesRerollDialogV2.wait({
            window: { title: `${_loc('GodsMenu.FateTab.AvesHeadTitle')} ${_loc('CHATFATE.selectDice')}` },
            content: html,
            rejectClose: false,
            buttons: [
                { action: 'yes', icon: 'fa-solid fa-check', label: 'ok', callback: (ev, btn, app) => Array.from(app.element.querySelectorAll('.dieSelected')).map((el) => Number(el.dataset.index)) },
                { action: 'cancel', icon: 'fa-solid fa-times', label: 'cancel', callback: () => null },
            ],
        });

        if (!diesToReroll?.length) return;

        const isPhex = DSA5GodsMenuConfig.hasPhexTradition(this.dsaActor);
        const rerollData = await processReroll(diesToReroll, newTestData, data.postData, 'CHATCONTEXT.Reroll', false, this.dsaActor, isPhex, isCheat);
        if (!rerollData) {
            ui.notifications.warn(_loc('GodsMenu.FateTab.ActionCancelled'));
            return;
        }

        newTestData.fateUsed = true;
        await this.dsaActor[data.postData.postFunction]({ testData: newTestData, cardOptions }, { rerenderMessage: this.message });

        const avesRollDetails = FateRolls.formatDieChangesHtml(rerollData.changedRolls);
        const heading = `${_loc('GodsMenu.FateTab.AvesHeadTitle')} (${_loc('GodsMenu.FateTab.AvesSecondRoll')})`;
        await ChatMessage.create(DSA5_Utility.chatDataSetup(`<h5 class="center"><b>${heading}</b></h5>${avesRollDetails}`));
    }

    async #handleAvesSecondDamageReroll(data, newTestData, cardOptions, isCheat) {
        const damageDice = extractDamageDice(newTestData.damageRoll);
        if (!damageDice.length) return;

        const dieIndex = await promptAvesDamageReroll(damageDice);
        if (dieIndex === null) return;

        const rerollResult = await processDamageReroll([dieIndex], newTestData.damageRoll, data.messageMode, isCheat);
        if (!rerollResult) return;

        newTestData.damageRoll = rerollResult.damageRoll;
        DSA5_Utility.clearUserTargets();
        await this.dsaActor[data.postData.postFunction]({ testData: newTestData, cardOptions }, { rerenderMessage: this.message });

        const updatedMsg = game.messages.get(this.message.id);
        if (updatedMsg?.isOwner) {
            await updatedMsg.update({ [`flags.data.${FateRolls.FLAGS.FATE_DAMAGE_REROLL}`]: true });
        }

        const heading = `${_loc('GodsMenu.FateTab.AvesHeadTitle')} (${_loc('GodsMenu.FateTab.AvesSecondRoll')})`;
        await ChatMessage.create(DSA5_Utility.chatDataSetup(`<h5 class="center"><b>${heading}</b></h5>${rerollResult.chatRollDetails}`));
    }

    async _executeGodsSheetAction({ data, newTestData, cardOptions, isCheat, avesDouble, schipToConsume, regenAllocations }) {
        const sheet = this.tabGroups.sheet;
        const tab = sheet.startsWith('specialAction_')
            ? 'specialAction'
            : (sheet.startsWith('regenBlessing_') ? 'regenBlessing' : sheet);
        const flagToUpdate = [];
        let chatActionLabel = '';
        let chatRollDetails = '';
        let specialRollsText = [];

        switch (tab) {
            case 'reroll':
            case 'meisterschicksal':
            case 'xeledon_reroll': {
                const isMasterReroll = tab === 'meisterschicksal';
                const isXeledon = tab === 'xeledon_reroll';
                const result = await executeReroll(this, data, newTestData, isCheat, isMasterReroll, isXeledon);
                if (!result) return null;
                chatActionLabel = result.chatActionLabel;
                chatRollDetails = result.chatRollDetails;
                flagToUpdate.push(result.flagToUpdate);
                if (isMasterReroll) schipToConsume = { pool: 'master' };
                break;
            }
            case 'rerollDamage':
            case 'beistand':
            case 'xeledon_rerollDamage': {
                const isMasterDamageReroll = tab === 'beistand';
                const isXeledon = tab === 'xeledon_rerollDamage';
                const result = await executeDamageReroll(this, data, newTestData, isCheat, isMasterDamageReroll, isXeledon);
                if (!result) return null;
                chatActionLabel = result.chatActionLabel;
                chatRollDetails = result.chatRollDetails;
                if (result.flagToUpdate) flagToUpdate.push(result.flagToUpdate);
                if (isMasterDamageReroll) schipToConsume = { pool: 'master' };
                break;
            }
            case 'addQS': {
                const result = await executeAddQS(this, newTestData, cardOptions, avesDouble);
                chatActionLabel = result.chatActionLabel;
                chatRollDetails = result.chatRollDetails;
                flagToUpdate.push(result.flagToUpdate);
                break;
            }
            case 'xeledon_addQS': {
                const result = await executeXeledonSubQS(newTestData, cardOptions);
                chatActionLabel = result.chatActionLabel;
                chatRollDetails = result.chatRollDetails;
                flagToUpdate.push(result.flagToUpdate);
                break;
            }
            case 'fieser': {
                const result = await executeFieserSchaden(this, data, newTestData, isCheat);
                if (!result) return null;
                chatActionLabel = result.chatActionLabel;
                chatRollDetails = result.chatRollDetails;
                flagToUpdate.push(result.flagToUpdate);
                schipToConsume = { pool: 'master' };
                break;
            }
            case 'gescheitert': {
                const result = await executeGescheitert(this, data, cardOptions);
                chatActionLabel = result.chatActionLabel;
                chatRollDetails = result.chatRollDetails;
                schipToConsume = { pool: 'master', amount: result.cost };
                break;
            }
            case 'meisterRegen': {
                const result = await executeMasterRegen(this, data, isCheat, cardOptions);
                if (!result) return null;
                chatActionLabel = result.chatActionLabel;
                chatRollDetails = result.chatRollDetails;
                flagToUpdate.push(result.flagToUpdate);
                schipToConsume = { pool: 'master' };
                break;
            }
            case 'regenBlessing': {
                const key = sheet.replace('regenBlessing_', '');
                const result = await executeRegenBlessing(this, key, regenAllocations, cardOptions);
                if (!result) return null;
                chatActionLabel = result.chatActionLabel;
                chatRollDetails = result.chatRollDetails;
                break;
            }
            case 'improve':
            case 'specialAction': {
                const result = await executeImprove(this, data, newTestData, isCheat, cardOptions);
                if (!result) return null;
                chatActionLabel = result.chatActionLabel;
                flagToUpdate.push(...result.flagsToUpdate);
                specialRollsText = result.specialRollsText;
                break;
            }
            default: {
                const customRes = await this._executeSheetAction({ data, newTestData, cardOptions, isCheat });
                if (!customRes) return null;
                chatActionLabel = customRes.chatActionLabel || _loc(`CHATFATE.${customRes.chatType}`);
                chatRollDetails = customRes.chatRollDetails || '';
                if (customRes.flagToUpdate) flagToUpdate.push(...customRes.flagToUpdate);
                if (schipToConsume && customRes.cost > 1) schipToConsume.amount = customRes.cost;
                break;
            }
        }

        return { chatActionLabel, chatRollDetails, flagToUpdate, specialRollsText, schipToConsume };
    }

    async #onGodsConfirm(event, target, isCheat = false) {
        const data = this.message.flags.data || {};
        const newTestData = data.preData || {};

        if (!this._validateSelectedPool()) return;
        if (!this._validateDieSelection()) return;

        const isSpecialAction = this.tabGroups.sheet.startsWith('specialAction_');
        const isRegenBlessing = this.tabGroups.sheet.startsWith('regenBlessing_');
        const isXeledon = this.tabGroups.sheet.startsWith('xeledon_');

        const preRoll = await this.#preparePreRollInputs(isSpecialAction, isRegenBlessing, isXeledon);
        if (!preRoll) return;
        const { regenAllocations, conditionsToRemove, manualReductions } = preRoll;

        const coinRoll = await FateRolls.throwCoin();

        let executeEffect = true;
        let schipToConsume = { pool: this.selectedPool, key: this.selectedSpecialKey };
        let specialRollHtml = '';

        if (this.selectedPool === 'special') {
            const symbolResult = await rollSpecialSchipSymbols({
                actor: this.dsaActor,
                key: this.selectedSpecialKey,
                isCheat,
                isPhexStandard: STANDARD_FATE_TABS.has(this.tabGroups?.sheet),
            });
            if (!symbolResult) return await this.close();
            ({ executeEffect, schipToConsume, specialRollHtml } = symbolResult);
        }

        if (!executeEffect) {
            const chatContent = await buildFateChatContent({
                actor: this.dsaActor,
                actionLabel: this.#attemptedActionLabel(),
                specialRollHtml,
                displayPool: this.selectedPool,
                displayKey: this.selectedSpecialKey,
                isConsumed: false,
                consumedAmount: 0,
                blocked: true,
            });
            await ChatMessage.create(DSA5_Utility.chatDataSetup(chatContent));
            return await this.close();
        }

        const avesResult = await this.#handleAvesCoin(coinRoll, isCheat);
        if (!avesResult) return;
        const { avesDouble, avesCoinHtml } = avesResult;

        const cardOptions = {
            flags: { img: { src: this.message.flags.img?.src } },
            messageMode: data.messageMode || this.message.flags?.dsa5?.rollRequest?.messageMode,
            speaker: this.message.speaker,
            template: data.template,
            title: data.title,
            user: this.message.author,
            messageId: this.message.id,
        };

        const isDamageContext = ['rerollDamage', 'beistand', 'fieser', 'xeledon_rerollDamage'].includes(this.tabGroups.sheet);
        for (const prop of ['attackerMessage', 'defenderMessage', 'unopposedStartMessage', 'startMessagesList']) {
            if (data[prop]) cardOptions[prop] = data[prop];
        }

        if (isDamageContext) {
            DSA5_Utility.clearUserTargets();
        } else if (data.originalTargets?.size) {
            game.user.targets = data.originalTargets;
            game.user.targets.user = game.user;
        }

        const actionResult = await this._executeGodsSheetAction({ data, newTestData, cardOptions, isCheat, avesDouble, schipToConsume, regenAllocations });
        if (!actionResult) return;

        let { chatActionLabel, chatRollDetails, flagToUpdate, specialRollsText } = actionResult;
        schipToConsume = actionResult.schipToConsume;

        const updates = {};
        flagToUpdate.forEach((flag) => { updates[`flags.data.${flag}`] = true; });

        const targetActor = this.targetActor;
        const needsGMDelegate = isXeledon && !game.user.isGM && (!this.message.isOwner || !targetActor?.isOwner);

        if (needsGMDelegate) {
            const serializedTestData = foundry.utils.deepClone(newTestData);
            if (serializedTestData.roll instanceof Roll) serializedTestData.roll = serializedTestData.roll.toJSON();
            const delegatedCardOptions = { ...cardOptions, user: this.message.author?.id };

            const delegated = await applyXeledonRollUpdate({
                messageId: this.message.id,
                postFunction: data.postData.postFunction,
                testData: serializedTestData,
                cardOptions: delegatedCardOptions,
                flagUpdates: updates,
                clearTargets: isDamageContext || this.tabGroups.sheet === 'xeledon_addQS',
            });
            if (!delegated?.ok) {
                ui.notifications.warn(_loc(delegated?.reason === 'alreadyUsed' ? 'GodsMenu.FateTab.XeledonAlreadyUsed' : 'GodsMenu.FateTab.XeledonNoGM'));
                return await this.close();
            }
        } else {
            if (!cardOptions.skipNativePostFunction) {
                await (isXeledon ? targetActor : this.dsaActor)[data.postData.postFunction]({ testData: newTestData, cardOptions }, { rerenderMessage: this.message });
            } else if (this.tabGroups.sheet === 'gescheitert') {
                const renderData = { testData: data.postData, preData: data.preData, hideData: data.hideData, hideDamage: data.hideDamage };
                const html = await renderTemplate(data.template, renderData);
                await this.message.update({ content: html, 'flags.data': data });
            }

            if ((isSpecialAction || isXeledon) && this.selectedSpecialKey) {
                const currentSpecials = [...(data.fateSpecialUsed || [])];
                if (!currentSpecials.includes(this.selectedSpecialKey)) {
                    currentSpecials.push(this.selectedSpecialKey);
                    updates['flags.data.fateSpecialUsed'] = currentSpecials;
                }
            }

            const updatedMessage = game.messages.get(this.message.id);
            if (Object.keys(updates).length > 0 && updatedMessage?.isOwner) await updatedMessage.update(updates);
        }

        const updatedMessage = game.messages.get(this.message.id);
        const isSuccessful = updatedMessage?.flags?.data?.postData?.successLevel > 0;

        if (this.isExternalXeledon && targetActor) {
            chatRollDetails = `<p><b>${_loc('GodsMenu.FateTab.XeledonTarget', { name: targetActor.name })}</b></p>${chatRollDetails}`;
        }

        if (avesCoinHtml) chatRollDetails += avesCoinHtml;

        if (isSpecialAction) {
            if (specialRollsText.length > 0) chatRollDetails += FateRolls.formatDieChangesHtml(specialRollsText);
            if (isSuccessful && flagToUpdate.includes(FateRolls.FLAGS.FATE_ADD_QS)) {
                chatRollDetails += `<p><b>${_loc('GodsMenu.FateTab.AddQS')}</b>: +2 QS</p>`;
            }
        }

        const finalPool = schipToConsume ? schipToConsume.pool : this.selectedPool;
        const finalKey = schipToConsume ? schipToConsume.key : this.selectedSpecialKey;
        const isConsumed = schipToConsume !== null;
        const consumedAmount = schipToConsume?.amount || 1;
        const chatContent = await buildFateChatContent({
            actor: this.dsaActor,
            actionLabel: chatActionLabel,
            rollDetails: chatRollDetails,
            specialRollHtml,
            displayPool: finalPool,
            displayKey: finalKey,
            isConsumed,
            consumedAmount,
        });
        await ChatMessage.create(DSA5_Utility.chatDataSetup(chatContent));

        await consumeSchip(this.dsaActor, schipToConsume);

        if (this.selectedPool === 'special' && isSpecialAction) {
            await applyDemonConditionRemovals(this.dsaActor, conditionsToRemove, manualReductions);
        }

        if (avesDouble) {
            if (this.tabGroups.sheet === 'reroll') {
                await this.#handleAvesSecondReroll(data, newTestData, cardOptions, isCheat);
            } else if (this.tabGroups.sheet === 'rerollDamage') {
                await this.#handleAvesSecondDamageReroll(data, newTestData, cardOptions, isCheat);
            }
        }

        await this.close();
    }
}
