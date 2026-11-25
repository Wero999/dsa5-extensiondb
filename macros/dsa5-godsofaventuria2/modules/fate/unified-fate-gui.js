import { DSA5GodsMenuConfig } from './config.js';
import { prepareDemonConditionRemovals, applyDemonConditionRemovals, applyXeledonRollUpdate } from './fate-effects.js';
import { isBlockedFromGodSchips, rollSpecialSchipSymbols, buildFateChatContent, resolveAvesCoin, executeAvesSecondReroll, executeAvesSecondDamageReroll, executeReroll, executeDamageReroll, executeAddQS, executeXeledonSubQS, executeFieserSchaden, executeGescheitert, executeImprove, executeMasterRegen, prepareRegenBlessing, executeRegenBlessing, consumeSchip } from './fate-actions.js';
import { DSA5_Utility, FateRolls, UnifiedFateDSA5 } from './dsa5-api.js';
import { buildUnifiedFateContext, buildRollRequestFateContext, buildActorPickerFateContext, buildExternalXeledonFateContext, getRegenBlessingActors, getXeledonCandidateActors, getRollCardSwitchActors, FATE_TAB_LABELS, STANDARD_ONLY_SPECIAL_KEYS, isStandardFateTab, parseTabId } from './fate-context.js';
import './fate-chat-menu.js';
import { notifyHeroSchipSpent } from './master-schip-automation.js';

const SYNCED_SETTINGS = new Set(['dsa5.groupschips', 'dsa5.masterschips']);

function pickInitialActor(actors, { checkControlled = false } = {}) {
    if (actors.length === 1) return actors[0];
    if (!game.user.isGM) {
        const userChar = game.user.character;
        return userChar && actors.some((a) => a.id === userChar.id) ? userChar : null;
    }
    if (checkControlled) {
        const controlled = canvas?.tokens?.controlled?.[0]?.actor;
        return controlled && actors.some((a) => a.id === controlled.id) ? controlled : null;
    }
    return null;
}

export default class GodsFateDSA5 extends UnifiedFateDSA5 {
    #isConfirming = false;
    #closedDuringConfirm = false;
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

    #onSettingSync = (setting) => {
        if (!this.rendered || this.#isConfirming) return;
        if (SYNCED_SETTINGS.has(setting.key)) this.render();
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

        const initialActor = pickInitialActor(eligibleActors, { checkControlled: true });
        const app = new this(message, initialActor || eligibleActors[0]);
        app.dsaActor = initialActor;
        app.selectedPool = 'special';
        return app.render(true);
    }

    static openForXeledon(message) {
        const candidates = getXeledonCandidateActors(message);
        if (!candidates.length) return;

        const initialActor = pickInitialActor(candidates);
        const app = new this(message, initialActor || candidates[0]);
        app.speakerActor = ChatMessage.getSpeakerActor(message.speaker);
        app.dsaActor = initialActor;
        app.selectedPool = 'special';
        app.selectedSpecialKey = 'Xeledon';
        return app.render(true);
    }

    close(options) {
        if (this.#isConfirming) this.#closedDuringConfirm = true;
        return super.close(options);
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
        Hooks.on('updateSetting', this.#onSettingSync);
    }

    async _onClose(options) {
        Hooks.off('updateChatMessage', this.#onLiveSync);
        Hooks.off('updateActor', this.#onLiveSync);
        Hooks.off('updateSetting', this.#onSettingSync);
        return super._onClose(options);
    }

    #resetSelections() {
        this.selectedForReroll?.clear?.();
        this.selectedForDamageReroll?.clear?.();
        this.selectedForImprove = -1;
        this.selectedForSpecialReroll = -1;
        this.selectedForMasterRegen = -1;
    }

    _onQuickSelectActor(_event, target) {
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

    _onToggleSpecialDie(_event, target) {
        const idx = parseInt(target.closest('[data-index]').dataset.index, 10);
        this.selectedForSpecialReroll = this.selectedForSpecialReroll === idx ? -1 : idx;
        this.render();
    }

    _onToggleMasterRegenDie(_event, target) {
        const idx = parseInt(target.closest('[data-index]').dataset.index, 10);
        this.selectedForMasterRegen = this.selectedForMasterRegen === idx ? -1 : idx;
        this.render();
    }

    _validateDieSelection() {
        const tab = this.tabGroups.sheet;
        const parsed = parseTabId(tab);
        if (tab === 'noOption' || tab === 'masterPlaceholder') {
            ui.notifications.warn(_loc('GodsMenu.FateTab.NoOptionNotify'));
            return false;
        }
        if (parsed.kind === 'specialAction' || parsed.kind === 'regenBlessing' || tab === 'xeledon_addQS') return true;
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
            if (DSA5GodsMenuConfig.getSpecialSchip(this.dsaActor, this.selectedSpecialKey).current <= 0) {
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
        this.#closedDuringConfirm = false;

        const lockedButtons = Array.from(
            this.element.querySelectorAll('button[data-action="confirm"], button[data-action="cheat"]'),
        ).filter((btn) => !btn.disabled);
        lockedButtons.forEach((btn) => { btn.disabled = true; });

        try {
            const parsed = parseTabId(this.tabGroups.sheet);
            if (parsed.key) {
                this.selectedPool = 'special';
                this.selectedSpecialKey = parsed.key;
            }
            if (this.selectedPool === 'special' || this.selectedPool === 'master') {
                return await this.#onGodsConfirm(event, target, isCheat);
            }

            const pool = this.selectedPool;
            const actor = this.dsaActor;
            const before = pool === 'personal'
                ? (actor?.system?.status?.fatePoints?.value || 0)
                : DSA5GodsMenuConfig.getSchipSetting('groupschips').current;

            const result = await super._onConfirm(event, target, isCheat);

            if (actor?.hasPlayerOwner) {
                const after = pool === 'personal'
                    ? (actor.system.status.fatePoints.value || 0)
                    : DSA5GodsMenuConfig.getSchipSetting('groupschips').current;
                let spent = Math.max(0, before - after);
                if (spent === 0 && (this.#closedDuringConfirm || !this.rendered)) spent = 1;
                if (spent > 0) await notifyHeroSchipSpent({ actor, pool, amount: spent });
            }
            return result;
        } finally {
            const wasClosed = this.#closedDuringConfirm;
            this.#isConfirming = false;
            this.#closedDuringConfirm = false;
            if (this.rendered && !wasClosed) lockedButtons.forEach((btn) => { btn.disabled = false; });
        }
    }

    #attemptedActionLabel() {
        const tab = this.tabGroups.sheet;
        const parsed = parseTabId(tab);
        if (parsed.kind === 'specialAction' || parsed.kind === 'regenBlessing') {
            return `${_loc('GodsMenu.FateTab.SpecialSchipAction')} [${DSA5GodsMenuConfig.schipName(parsed.key)}]`;
        }
        if (parsed.kind === 'xeledon') {
            return _loc('GodsMenu.FateTab.XeledonActionLabel', { label: _loc(FATE_TAB_LABELS[parsed.action]) });
        }
        if (FATE_TAB_LABELS[tab]) return _loc(FATE_TAB_LABELS[tab]);
        return this.element?.querySelector(`nav [data-tab="${tab}"]`)?.textContent.trim() || tab;
    }

    #syncStandardOnlySchipGlow() {
        if (this.isRollRequest || this.isExternalXeledon) return;
        const isStandard = isStandardFateTab(this);

        for (const key of STANDARD_ONLY_SPECIAL_KEYS) {
            this.element?.querySelectorAll(`.special-schip[data-key="${key}"].fullSchip`).forEach((btn) => {
                btn.classList.toggle('special-schip-relevant', isStandard);
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
        const parsed = parseTabId(this.tabGroups.sheet);
        if (this.isRollRequest && parsed.kind === 'regenBlessing') {
            this.selectedSpecialKey = parsed.key;
            this.element.querySelectorAll('.special-schip').forEach((btn) => {
                btn.classList.toggle('schip-selected', btn.dataset.key === parsed.key);
            });
        }
        this.#syncStandardOnlySchipGlow();
    }

    async #preparePreRollInputs(parsedTab) {
        let regenAllocations = null;
        let conditionsToRemove = [];
        let manualReductions = {};

        if (parsedTab.kind === 'xeledon') {
            if ((this.message.flags?.data?.fateSpecialUsed || []).includes('Xeledon')) {
                ui.notifications.warn(_loc('GodsMenu.FateTab.XeledonAlreadyUsed'));
                return null;
            }
            if (!game.user.isGM && (!this.message.isOwner || !this.targetActor?.isOwner) && !game.users.activeGM) {
                ui.notifications.error(_loc('GodsMenu.FateTab.XeledonNoGM'));
                return null;
            }
        }

        if (parsedTab.kind === 'regenBlessing') {
            regenAllocations = await prepareRegenBlessing(this, this.selectedSpecialKey);
            if (!regenAllocations) return null;
        }

        if (this.selectedPool === 'special' && this.selectedSpecialKey && parsedTab.kind === 'specialAction') {
            const prepared = await prepareDemonConditionRemovals(this.dsaActor, this.selectedSpecialKey);
            if (!prepared) return null;
            ({ conditionsToRemove, manualReductions } = prepared);
        }

        return { regenAllocations, conditionsToRemove, manualReductions };
    }

    async _executeGodsSheetAction({ data, newTestData, cardOptions, isCheat, avesDouble, schipToConsume, regenAllocations }) {
        const parsed = parseTabId(this.tabGroups.sheet);
        const tab = parsed.kind === 'specialAction' || parsed.kind === 'regenBlessing' ? parsed.kind : this.tabGroups.sheet;
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
                ({ chatActionLabel, chatRollDetails } = result);
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
                ({ chatActionLabel, chatRollDetails } = result);
                if (result.flagToUpdate) flagToUpdate.push(result.flagToUpdate);
                if (isMasterDamageReroll) schipToConsume = { pool: 'master' };
                break;
            }
            case 'addQS': {
                const result = await executeAddQS(this, newTestData, cardOptions, avesDouble);
                ({ chatActionLabel, chatRollDetails } = result);
                flagToUpdate.push(result.flagToUpdate);
                break;
            }
            case 'xeledon_addQS': {
                const result = await executeXeledonSubQS(data, newTestData, cardOptions);
                ({ chatActionLabel, chatRollDetails } = result);
                flagToUpdate.push(result.flagToUpdate);
                break;
            }
            case 'fieser': {
                const result = await executeFieserSchaden(this, data, newTestData, isCheat);
                if (!result) return null;
                ({ chatActionLabel, chatRollDetails } = result);
                flagToUpdate.push(result.flagToUpdate);
                schipToConsume = { pool: 'master' };
                break;
            }
            case 'gescheitert': {
                const result = await executeGescheitert(this, data, cardOptions);
                ({ chatActionLabel, chatRollDetails } = result);
                schipToConsume = { pool: 'master', amount: result.cost };
                break;
            }
            case 'meisterRegen': {
                const result = await executeMasterRegen(this, data, isCheat, cardOptions);
                if (!result) return null;
                ({ chatActionLabel, chatRollDetails } = result);
                flagToUpdate.push(result.flagToUpdate);
                schipToConsume = { pool: 'master' };
                break;
            }
            case 'regenBlessing': {
                const result = await executeRegenBlessing(this, parsed.key, regenAllocations, cardOptions);
                if (!result) return null;
                ({ chatActionLabel, chatRollDetails } = result);
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
                const customRes = await this._executeSheetAction({ data, newTestData, cardOptions, isCheat, avesDouble });
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

    async #onGodsConfirm(_event, _target, isCheat = false) {
        const data = this.message.flags.data || {};
        const newTestData = data.preData || {};

        if (!this._validateSelectedPool()) return;
        if (!this._validateDieSelection()) return;

        const parsedTab = parseTabId(this.tabGroups.sheet);
        const isSpecialAction = parsedTab.kind === 'specialAction';
        const isXeledon = parsedTab.kind === 'xeledon';

        const preRoll = await this.#preparePreRollInputs(parsedTab);
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
                isPhexStandard: isStandardFateTab(this),
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

        const avesResult = await resolveAvesCoin({
            actor: this.dsaActor,
            selectedPool: this.selectedPool,
            selectedSpecialKey: this.selectedSpecialKey,
            isStandard: isStandardFateTab(this),
            coinRoll,
            isCheat,
        });
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
            const { user: _ignoredUser, ...delegatedCardOptions } = cardOptions;

            const delegated = await applyXeledonRollUpdate({
                casterId: this.dsaActor.id,
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
            chatRollDetails = `<p><b>${_loc('GodsMenu.FateTab.XeledonTarget', { name: foundry.utils.escapeHTML(targetActor.name) })}</b></p>${chatRollDetails}`;
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
        const chatContent = await buildFateChatContent({
            actor: this.dsaActor,
            actionLabel: chatActionLabel,
            rollDetails: chatRollDetails,
            specialRollHtml,
            displayPool: finalPool,
            displayKey: finalKey,
            isConsumed: schipToConsume !== null,
            consumedAmount: schipToConsume?.amount || 1,
        });
        await ChatMessage.create(DSA5_Utility.chatDataSetup(chatContent));

        await consumeSchip(this.dsaActor, schipToConsume);

        if (this.selectedPool === 'special' && isSpecialAction) {
            await applyDemonConditionRemovals(this.dsaActor, conditionsToRemove, manualReductions);
        }

        if (avesDouble) {
            const avesArgs = { actor: this.dsaActor, message: this.message, data, newTestData, cardOptions, isCheat };
            if (this.tabGroups.sheet === 'reroll') await executeAvesSecondReroll(avesArgs);
            else if (this.tabGroups.sheet === 'rerollDamage') await executeAvesSecondDamageReroll(avesArgs);
        }

        await this.close();
    }
}
