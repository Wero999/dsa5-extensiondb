import { DSA5GodsMenuConfig, REGEN_BLESSING_CONFIG } from './config.js';
import { DiceDSA5, FateRolls } from './dsa5-api.js';

export const STANDARD_FATE_TABS = new Set(['reroll', 'rerollDamage', 'addQS']);
export const STANDARD_ONLY_SPECIAL_KEYS = new Set(['Aves', 'Phex']);

export const FATE_TAB_LABELS = {
    reroll: 'GodsMenu.FateTab.Reroll',
    rerollDamage: 'GodsMenu.FateTab.RerollDamage',
    improve: 'GodsMenu.FateTab.Improve',
    addQS: 'GodsMenu.FateTab.AddQS',
    beistand: 'GodsMenu.FateTab.MasterDarkness',
    fieser: 'GodsMenu.FateTab.MasterNastyDamage',
    gescheitert: 'GodsMenu.FateTab.MasterFailedAttack',
    meisterschicksal: 'GodsMenu.FateTab.MasterFate',
    meisterRegen: 'GodsMenu.FateTab.MasterRegen',
    masterPlaceholder: 'GodsMenu.FateTab.MasterNoOption',
    noOption: 'GodsMenu.FateTab.NoOption',
};

const MASTER_TAB_IDS = new Set(['beistand', 'fieser', 'gescheitert', 'meisterschicksal', 'meisterRegen', 'masterPlaceholder']);
const MAGIC_TYPES = new Set(['spell', 'liturgy', 'ritual', 'ceremony', 'magicalsign']);

const createTab = (id, activeTab, label = FATE_TAB_LABELS[id]) => ({
    id,
    label,
    cssClass: activeTab === id ? 'active' : '',
});

function activateFirstTab(app, tabsDef) {
    const firstKey = Object.keys(tabsDef)[0];
    if (!firstKey) return null;
    app.tabGroups.sheet = firstKey;
    tabsDef[firstKey].cssClass = 'active';
    return firstKey;
}

export function isStandardFateTab(app) {
    return STANDARD_FATE_TABS.has(app?.tabGroups?.sheet) || !!app?.isStandardFateTab;
}

export function parseTabId(tabId = '') {
    if (tabId.startsWith('specialAction_')) return { kind: 'specialAction', key: tabId.slice('specialAction_'.length) };
    if (tabId.startsWith('regenBlessing_')) return { kind: 'regenBlessing', key: tabId.slice('regenBlessing_'.length) };
    if (tabId.startsWith('xeledon_')) return { kind: 'xeledon', key: 'Xeledon', action: tabId.slice('xeledon_'.length) };
    return { kind: 'standard', key: null, action: tabId };
}

export function extractDamageDice(damageRollData, selectedIndices = new Set()) {
    const damageDice = [];
    const rollInstance = DiceDSA5.fromRollData(damageRollData);
    if (!rollInstance?.terms) return damageDice;

    let dieIndex = 0;
    for (const term of rollInstance.terms) {
        for (const res of (term.results || [])) {
            damageDice.push({
                index: dieIndex,
                currentValue: res.result,
                faces: term.faces,
                tooltip: _loc('Trefferpunkte'),
                selected: selectedIndices.has(dieIndex),
            });
            dieIndex++;
        }
    }
    return damageDice;
}

function extractD20Dice(app, preData, postData) {
    const type = preData.source?.type;
    const mode = preData.mode;
    const isCombat = DSA5GodsMenuConfig.isCombatRoll(preData);
    const sheetTab = app.tabGroups.sheet || '';

    return (postData.characteristics || [])
        .filter((item) => item.char !== 'damage')
        .map((item, i) => {
            const attr = isCombat ? (type === 'dodge' ? 'dodge' : (mode || type)) : (item.char || 'd20');
            const rerollSelected = app.selectedForReroll.has(i);
            return {
                index: i,
                currentValue: item.res,
                attr,
                cssClass: item.suc ? 'suc' : 'fail',
                tooltip: item.tar ? `${_loc(item.char === 'attack' ? 'Attack' : item.char === 'parry' ? 'Parry' : `CHAR.${item.char.toUpperCase()}`)} vs ${item.tar}` : '',
                rerollSelected,
                selected: (sheetTab === 'reroll' || sheetTab === 'meisterschicksal' || sheetTab === 'xeledon_reroll') ? rerollSelected : app.selectedForImprove === i,
                specialSelected: sheetTab.startsWith('specialAction_') ? app.selectedForSpecialReroll === i : false,
            };
        });
}

// --- Xeledon Helper ---

export function hasAvailableXeledonSchip(actor) {
    return DSA5GodsMenuConfig.getSpecialSchip(actor, 'Xeledon').current > 0;
}

export function getAvailableXeledonOptions(message, { isSpeakerOwner = false } = {}) {
    const data = message?.flags?.data;
    const preData = data?.preData;
    const postData = data?.postData;
    if (!preData || !postData) return [];

    if ((data.fateSpecialUsed || []).includes('Xeledon')) return [];

    const type = preData.source?.type;
    if ((postData.rollType || type) === 'regenerate') return [];

    const isCombat = DSA5GodsMenuConfig.isCombatRoll(preData);
    const hasD20Roll = !!postData.characteristics || !!preData.roll;
    const hasDamageRoll = !!postData.damageRoll;
    const canSeeDamage = data.hideDamage !== true || isSpeakerOwner || game.user.isGM;
    const successLevel = postData.successLevel || 0;

    const options = [];
    if (hasD20Roll && !data.fatePointRerollUsed) options.push('reroll');
    if (hasDamageRoll && canSeeDamage && !data.fatePointDamageRerollUsed) options.push('rerollDamage');
    if (successLevel > 0 && !data.fatePointAddQSUsed && Number(postData.qualityStep) > 1 && !isCombat) options.push('addQS');

    return options;
}

export function getXeledonCandidateActors(message) {
    const speakerActor = ChatMessage.getSpeakerActor(message?.speaker);
    const isSpeakerOwner = !!speakerActor?.isOwner;
    if (!getAvailableXeledonOptions(message, { isSpeakerOwner }).length) return [];

    const playerAssignedIds = new Set(
        game.users.filter((u) => !u.isGM && u.character).map((u) => u.character.id),
    );

    return game.actors.filter((actor) => {
        if (!hasAvailableXeledonSchip(actor)) return false;
        if (game.user.isGM) return actor.hasPlayerOwner || playerAssignedIds.has(actor.id);
        return actor.isOwner;
    });
}

export function getRollCardSwitchActors(message, speakerActor) {
    const candidates = getXeledonCandidateActors(message);
    const externalXeledon = candidates.filter((a) => a.uuid !== speakerActor?.uuid);

    if (game.user.isGM || speakerActor?.isOwner) {
        if (!externalXeledon.length) return [];
        return speakerActor ? [speakerActor, ...externalXeledon] : externalXeledon;
    }

    return externalXeledon;
}

function buildXeledonTabEntries(options, activeTab) {
    const xeledonTabs = {};
    const list = [];
    for (const opt of options) {
        const id = `xeledon_${opt}`;
        const label = _loc('GodsMenu.FateTab.XeledonActionLabel', { label: _loc(FATE_TAB_LABELS[opt]) });
        const tab = createTab(id, activeTab, label);
        xeledonTabs[opt] = tab;
        list.push(tab);
    }
    return { xeledonTabs, list };
}

// --- Roll-Request (Mada / Travia) Helper ---

export function getRollRequestActors(message) {
    const req = message?.flags?.dsa5?.rollRequest;
    if (!req) return [];

    const ids = new Set();
    for (const r of (req.recipients || [])) {
        const id = typeof r === 'string' ? r : (r?.actorId || r?.id || r?.actor?.id);
        if (id) {
            ids.add(id);
        } else if (r?.uuid) {
            const doc = fromUuidSync(r.uuid);
            if (doc?.id) ids.add(doc.id);
        }
    }

    if (!ids.size && message.content) {
        const tpl = document.createElement('template');
        tpl.innerHTML = message.content;
        tpl.content.querySelectorAll('.roll-request-row[data-actor-id]').forEach((el) => {
            if (el.dataset.actorId) ids.add(el.dataset.actorId);
        });
    }

    return Array.from(ids).map((id) => game.actors.get(id)).filter(Boolean);
}

export function getEligibleCompanions(caster, message, key) {
    const cfg = REGEN_BLESSING_CONFIG[key];
    if (!cfg || !caster) return [];
    return getRollRequestActors(message).filter((actor) => actor.id !== caster.id && cfg.filterTarget(actor));
}

export function getAvailableRegenBlessingKeys(actor, message) {
    if (!actor || !message) return [];
    const used = message.flags?.data?.fateSpecialUsed || [];

    return Object.keys(REGEN_BLESSING_CONFIG).filter(
        (key) => !used.includes(key)
            && DSA5GodsMenuConfig.getSpecialSchip(actor, key).current > 0
            && getEligibleCompanions(actor, message, key).length > 0,
    );
}

export function getRegenBlessingActors(message) {
    const req = message?.flags?.dsa5?.rollRequest;
    if (req?.category !== 'regeneration' || req.finalized) return [];

    return getRollRequestActors(message).filter(
        (actor) => (game.user.isGM || actor.isOwner) && getAvailableRegenBlessingKeys(actor, message).length > 0,
    );
}

// --- Context Builder ---

export function buildActorPickerFateContext(app) {
    const switchActors = getRollCardSwitchActors(app.message, app.targetActor);
    return {
        showActorHeader: true,
        showFateBody: false,
        actor: null,
        availableActors: switchActors.map((a) => ({ id: a.id, name: a.name, img: a.img })),
        canSwitchActor: true,
        showActorSwitcher: true,
        hasFateAction: false,
        isGM: game.user.isGM,
    };
}

export function buildExternalXeledonFateContext(app) {
    const data = app.message.flags.data;
    const switchActors = getRollCardSwitchActors(app.message, app.targetActor);
    const options = getAvailableXeledonOptions(app.message, { isSpeakerOwner: !!app.targetActor?.isOwner });

    app.selectedPool = 'special';
    app.selectedSpecialKey = 'Xeledon';

    const { xeledonTabs, list } = buildXeledonTabEntries(options, app.tabGroups.sheet);
    const tabsDef = {};
    for (const tab of list) tabsDef[tab.id] = tab;

    if (list.length && !tabsDef[app.tabGroups.sheet]) {
        activateFirstTab(app, tabsDef);
    } else if (!list.length) {
        tabsDef.noOption = createTab('noOption', 'noOption');
        app.tabGroups.sheet = 'noOption';
    }

    const { current, max } = DSA5GodsMenuConfig.getSpecialSchip(app.dsaActor, 'Xeledon');
    const label = DSA5GodsMenuConfig.schipLabel('Xeledon');
    const imgStyle = DSA5GodsMenuConfig.chipStyle('Xeledon');
    const specialSchips = max > 0
        ? DSA5GodsMenuConfig.buildSchipDots(max, current, (isFull) => ({
            key: 'Xeledon',
            tooltip: label,
            imgStyle,
            isRelevant: isFull && list.length > 0,
            isSelected: true,
            isGod: true,
        }))
        : [];

    const dice = xeledonTabs.reroll ? extractD20Dice(app, data.preData, data.postData) : [];
    const damageDice = xeledonTabs.rerollDamage
        ? extractDamageDice(data.postData.damageRoll, app.selectedForDamageReroll)
        : [];
    const canSwitchActor = switchActors.length > 1;

    return {
        showActorHeader: canSwitchActor,
        showFateBody: true,
        actor: app.dsaActor,
        availableActors: switchActors.map((a) => ({ id: a.id, name: a.name, img: a.img })),
        canSwitchActor,
        showActorSwitcher: canSwitchActor,
        tabs: tabsDef,
        activeSpecialTabs: [],
        xeledonTabs,
        dice,
        damageDice,
        specialImg: DSA5GodsMenuConfig.chipIcon(null),
        activeTab: app.tabGroups.sheet,
        specialSchips,
        isSpecialPool: true,
        hasSpecial: specialSchips.length > 0,
        specialSchipDescription: DSA5GodsMenuConfig.schipDescription('Xeledon'),
        hasFateAction: list.length > 0 && current > 0,
        isGM: game.user.isGM,
    };
}

export function buildRollRequestFateContext(app) {
    const eligibleActors = getRegenBlessingActors(app.message);
    if (app.dsaActor && !eligibleActors.some((a) => a.id === app.dsaActor.id)) {
        app.dsaActor = eligibleActors.length === 1 ? eligibleActors[0] : null;
    }

    const availableKeys = app.dsaActor ? getAvailableRegenBlessingKeys(app.dsaActor, app.message) : [];
    app.selectedPool = 'special';

    if (!availableKeys.includes(app.selectedSpecialKey)) {
        app.selectedSpecialKey = availableKeys[0] || null;
    }

    const tabsDef = {};
    const regenBlessingTabs = [];
    const specialSchips = [];

    if (app.dsaActor) {
        for (const key of availableKeys) {
            const tabId = `regenBlessing_${key}`;
            const label = DSA5GodsMenuConfig.schipLabel(key);
            const tab = createTab(tabId, app.tabGroups.sheet, label);

            tabsDef[tabId] = tab;
            regenBlessingTabs.push({ ...tab, description: DSA5GodsMenuConfig.schipDescription(key) });

            const { current, max } = DSA5GodsMenuConfig.getSpecialSchip(app.dsaActor, key);
            const imgStyle = DSA5GodsMenuConfig.chipStyle(key);
            specialSchips.push(...DSA5GodsMenuConfig.buildSchipDots(max, current, (isFull) => ({
                key,
                tooltip: label,
                imgStyle,
                isRelevant: isFull,
                isSelected: app.selectedSpecialKey === key,
                isGod: true,
            })));
        }

        if (!tabsDef[app.tabGroups.sheet]) {
            const activeId = `regenBlessing_${app.selectedSpecialKey}`;
            app.tabGroups.sheet = activeId;
            tabsDef[activeId].cssClass = 'active';
            regenBlessingTabs.find((t) => t.id === activeId).cssClass = 'active';
        }
    }

    const canSwitchActor = eligibleActors.length > 1;

    return {
        showActorHeader: canSwitchActor,
        showFateBody: !!app.dsaActor,
        actor: app.dsaActor,
        availableActors: eligibleActors.map((a) => ({ id: a.id, name: a.name, img: a.img })),
        canSwitchActor,
        showActorSwitcher: canSwitchActor,
        tabs: tabsDef,
        activeSpecialTabs: [],
        regenBlessingTabs,
        specialImg: DSA5GodsMenuConfig.chipIcon(null),
        activeTab: app.tabGroups.sheet,
        specialSchips,
        isSpecialPool: true,
        hasSpecial: specialSchips.length > 0,
        hasFateAction: !!app.dsaActor,
        isGM: game.user.isGM,
    };
}

export async function buildUnifiedFateContext(app, baseContext) {
    const data = app.message.flags.data;
    const postData = data.postData;
    const preData = data.preData;
    const hasRealMessage = Boolean(app.message?.id);

    const rollName = preData.source?.name || '';
    const usedSpecialKeys = data.fateSpecialUsed || [];
    const damageRevealed = data.hideDamage === false
        || app.message.content.includes('data-hide-damage="false"')
        || app.message.content.includes('opposed-card');

    const successLevel = postData.successLevel || 0;
    const type = preData.source?.type;
    const mode = preData.mode;
    const isRegen = (postData.rollType || type) === 'regenerate';

    const isCombat = DSA5GodsMenuConfig.isCombatRoll(preData);
    const isAttack = mode === 'attack' || postData.characteristics?.some((c) => c.char === 'attack');
    const isParry = mode === 'parry' || postData.characteristics?.some((c) => c.char === 'parry');
    const isRange = type === 'rangeweapon' || mode === 'range';
    const isDodge = type === 'dodge' || rollName === _loc('Dodge');

    let improveSkill = null;
    if (isAttack) improveSkill = 'SCHIPSKILLS.meleeweaponattack';
    else if (isRange) improveSkill = 'SCHIPSKILLS.rangeweaponattack';
    else if (isDodge) improveSkill = 'SCHIPSKILLS.dodge';
    else if (isParry) improveSkill = 'SCHIPSKILLS.meleeweaponparry';
    else if (type === 'attribute' || FateRolls.MULTI_DIE_ROLL_TYPES.includes(type)) improveSkill = 'SCHIPSKILLS.char';

    const canImprove = improveSkill
        ? app.dsaActor.items.some((i) => i.name === _loc(improveSkill) && i.system?.category?.value === 'fatePoints')
        : false;

    const hasD20Roll = !isRegen && (!!postData.characteristics || !!preData.roll);
    const hasDamageRoll = !!postData.damageRoll;
    const canAddQS = successLevel > 0 && !data.fatePointAddQSUsed && postData.qualityStep !== undefined && !isCombat;

    const tabsDef = {};
    if (hasD20Roll && !data.fatePointRerollUsed) tabsDef.reroll = createTab('reroll', app.tabGroups.sheet);
    if (hasDamageRoll && !data.fatePointDamageRerollUsed) tabsDef.rerollDamage = createTab('rerollDamage', app.tabGroups.sheet);
    if (hasD20Roll && canImprove && !data.fateImproved) tabsDef.improve = createTab('improve', app.tabGroups.sheet);
    if (canAddQS) tabsDef.addQS = createTab('addQS', app.tabGroups.sheet);

    const parsedCurrent = parseTabId(app.tabGroups.sheet);
    const isSpecialSubTab = parsedCurrent.kind === 'specialAction' || parsedCurrent.kind === 'xeledon';
    if (!tabsDef[app.tabGroups.sheet] && !isSpecialSubTab && !MASTER_TAB_IDS.has(app.tabGroups.sheet)) {
        activateFirstTab(app, tabsDef);
    }

    const dice = extractD20Dice(app, preData, postData);
    const damageDice = hasDamageRoll
        ? extractDamageDice(postData.damageRoll, app.selectedForDamageReroll)
        : [];

    const masterRegenDice = [];
    if (isRegen && game.user.isGM && !data.meisterRegenUsed) {
        const tpl = document.createElement('template');
        tpl.innerHTML = app.message.content;
        tpl.content.querySelectorAll('.roll-result span.d6').forEach((el, index) => {
            const rawClass = el.getAttribute('class') || '';
            const attr = rawClass.match(/die-(LeP|AsP|KaP)/)?.[1];
            if (!attr) return;
            masterRegenDice.push({
                index,
                currentValue: parseInt(el.textContent, 10),
                tooltip: el.getAttribute('data-tooltip') || '',
                cssClass: rawClass.replace(/display-toggle|d6|die-(LeP|AsP|KaP)/g, '').trim(),
                attr,
                selected: app.selectedForMasterRegen === index,
            });
        });
    }

    const personalTooltip = _loc('GodsMenu.FateTab.FatePoint');
    const personalSchips = DSA5GodsMenuConfig.buildSchipDots(
        app.dsaActor.system.status.fatePoints.current || 0,
        app.dsaActor.system.status.fatePoints.value || 0,
        () => ({ tooltip: personalTooltip }),
    );

    const { current: grpCur, max: grpMax } = DSA5GodsMenuConfig.getSchipSetting('groupschips');
    const groupTooltip = _loc('FORMULA.groupFatePoints');
    const groupSchips = DSA5GodsMenuConfig.buildSchipDots(grpMax, grpCur, () => ({ tooltip: groupTooltip }));

    const xeledonOptions = hasRealMessage ? getAvailableXeledonOptions(app.message, { isSpeakerOwner: true }) : [];

    const specialSchips = [];
    let activeSpecialTab = null;
    let activeSpecialTabs = [];
    let xeledonTabs = {};
    let hasGodChips = false;
    let hasDemonChips = false;

    const specialPointsObj = foundry.utils.getProperty(app.dsaActor, 'flags.dsa5.specialPoints');
    if (specialPointsObj) {
        for (const [key, sData] of Object.entries(specialPointsObj)) {
            if ((sData?.value || 0) <= 0) continue;

            const isQsAndReroll = DSA5GodsMenuConfig.isQsAndReroll(key, rollName);
            const isXeledonRelevant = key === 'Xeledon' && xeledonOptions.length > 0;
            const isRelevant = isQsAndReroll || DSA5GodsMenuConfig.isExtraReroll(key, rollName) || isXeledonRelevant;
            const isGod = DSA5GodsMenuConfig.isGod(key);
            if (isGod) hasGodChips = true;
            else hasDemonChips = true;

            const imgStyle = DSA5GodsMenuConfig.chipStyle(key);
            const label = DSA5GodsMenuConfig.schipLabel(key);

            if ((sData.current || 0) > 0 && app.selectedPool === 'special' && app.selectedSpecialKey === key && !usedSpecialKeys.includes(key)) {
                if (isQsAndReroll) {
                    activeSpecialTab = createTab(`specialAction_${key}`, app.tabGroups.sheet, label);
                    activeSpecialTabs = [activeSpecialTab];
                } else if (isXeledonRelevant) {
                    const built = buildXeledonTabEntries(xeledonOptions, app.tabGroups.sheet);
                    xeledonTabs = built.xeledonTabs;
                    activeSpecialTabs = built.list;
                }
            }

            specialSchips.push(...DSA5GodsMenuConfig.buildSchipDots(sData.value, sData.current || 0, (isFull) => ({
                key,
                tooltip: label,
                imgStyle,
                isRelevant: isRelevant && isFull,
                isSelected: app.selectedPool === 'special' && app.selectedSpecialKey === key,
                isGod,
            })));
        }
    }

    const masterSetting = game.user.isGM ? DSA5GodsMenuConfig.getSchipSetting('masterschips') : { current: 0, max: 0 };
    const hasMaster = masterSetting.max > 0;
    const masterSchips = DSA5GodsMenuConfig.buildMasterSchipDots(masterSetting.max, masterSetting.current, {
        tooltip: _loc('GodsMenu.masterFatePointsTooltip'),
    });

    const masterTabsDef = {};
    const isPC = app.dsaActor.hasPlayerOwner;
    const hasD6Damage = damageDice.some((d) => d.faces === 6);

    if (isPC && hasDamageRoll && hasD6Damage && damageRevealed) {
        masterTabsDef.beistand = createTab('beistand', app.tabGroups.sheet);
    }
    if (!isPC && (isAttack || isRange) && hasDamageRoll && !data.fieserSchadenUsed && !damageRevealed) {
        masterTabsDef.fieser = createTab('fieser', app.tabGroups.sheet);
    }

    const isSuccess = successLevel > 0 || postData.success;
    const isCrit = successLevel > 2 || postData.critical;
    const failCost = isCrit ? 3 : 2;
    if (game.user.isGM && isPC && (isAttack || isRange) && isSuccess && !MAGIC_TYPES.has(type) && masterSetting.current >= failCost) {
        masterTabsDef.gescheitert = createTab('gescheitert', app.tabGroups.sheet);
    }

    if (hasD20Roll && !data.meisterSchicksalUsed) {
        masterTabsDef.meisterschicksal = createTab('meisterschicksal', app.tabGroups.sheet);
    }
    if (isRegen && masterRegenDice.length && !data.meisterRegenUsed) {
        masterTabsDef.meisterRegen = createTab('meisterRegen', app.tabGroups.sheet);
    }
    if (Object.keys(masterTabsDef).length === 0) {
        masterTabsDef.masterPlaceholder = createTab('masterPlaceholder', app.tabGroups.sheet);
    }

    const partyUuid = game.settings.get('dsa5', 'primaryParty');
    const groupActor = (partyUuid ? fromUuidSync(partyUuid) : null) || game.actors.find((a) => a.type === 'group');
    const isGroupMember = Object.values(groupActor?.system?.members ?? {}).some((member) => member.uuid === app.dsaActor.uuid);

    const hasPersonal = personalSchips.length > 0;
    const hasGroupSchips = groupSchips.length > 0 && isGroupMember;
    const hasSpecialSchips = specialSchips.length > 0;

    const poolAvailable = { personal: hasPersonal, group: hasGroupSchips, special: hasSpecialSchips, master: hasMaster };
    if (!poolAvailable[app.selectedPool]) {
        app.selectedPool = ['personal', 'group', 'special', 'master'].find((pool) => poolAvailable[pool]) ?? app.selectedPool;
    }

    if (app.selectedPool === 'master') {
        for (const key in tabsDef) delete tabsDef[key];
        Object.assign(tabsDef, masterTabsDef);
        if (!tabsDef[app.tabGroups.sheet]) activateFirstTab(app, tabsDef);
        activeSpecialTab = null;
        activeSpecialTabs = [];
        xeledonTabs = {};
    } else if (
        !activeSpecialTabs.some((t) => t.id === app.tabGroups.sheet)
        && (isSpecialSubTab || MASTER_TAB_IDS.has(app.tabGroups.sheet))
    ) {
        activateFirstTab(app, tabsDef);
    }

    if (Object.keys(tabsDef).length === 0 && !activeSpecialTabs.length) {
        tabsDef.noOption = createTab('noOption', 'noOption');
        app.tabGroups.sheet = 'noOption';
    }

    const isStandardTab = isStandardFateTab(app);
    for (const chip of specialSchips) {
        if (STANDARD_ONLY_SPECIAL_KEYS.has(chip.key)) {
            chip.isRelevant = chip.isRelevant && isStandardTab;
        }
    }

    const availablePoolsCount = [hasPersonal, hasGroupSchips, hasSpecialSchips, hasMaster].filter(Boolean).length;
    const hasFateAction = availablePoolsCount > 0 && (
        activeSpecialTabs.length > 0
        || Object.keys(tabsDef).some((id) => id !== 'noOption' && id !== 'masterPlaceholder')
    );

    const dynamicSpecialImg = (hasDemonChips && !hasGodChips)
        ? DSA5GodsMenuConfig.chipIcon(null, 'Erzdaemonen.webp')
        : DSA5GodsMenuConfig.chipIcon(null);

    const specialSchipDescription = (app.selectedPool === 'special' && app.selectedSpecialKey)
        ? DSA5GodsMenuConfig.schipDescription(app.selectedSpecialKey)
        : _loc('GodsMenu.FateTab.SpecialSchipHint');

    const addQSDesc = app.selectedPool === 'special' && DSA5GodsMenuConfig.isQsAndReroll(app.selectedSpecialKey, rollName)
        ? _loc('GodsMenu.FateTab.AddQSDescSpecial')
        : _loc('GodsMenu.FateTab.AddQSDesc');

    let masterDesc = '';
    let masterCost = '';
    if (app.selectedPool === 'master' && app.tabGroups.sheet === 'gescheitert') {
        masterDesc = _loc('GodsMenu.FateTab.MasterFailedDescFull');
        const attackType = isCrit ? _loc('GodsMenu.FateTab.CritAttack') : _loc('GodsMenu.FateTab.RegularAttack');
        masterCost = _loc('GodsMenu.FateTab.MasterFailedCostDetail', { type: attackType, cost: failCost });
    }

    const switchActors = hasRealMessage ? getRollCardSwitchActors(app.message, app.targetActor) : [];
    const showActorHeader = switchActors.length > 1;

    return {
        ...baseContext,
        showActorHeader,
        showFateBody: true,
        actor: app.dsaActor,
        availableActors: switchActors.map((a) => ({ id: a.id, name: a.name, img: a.img })),
        canSwitchActor: showActorHeader,
        showActorSwitcher: showActorHeader,
        tabs: tabsDef,
        regenBlessingTabs: [],
        activeSpecialTab,
        activeSpecialTabs,
        xeledonTabs,
        dice,
        damageDice,
        masterRegenDice,
        actorImg: app.dsaActor.img,
        groupImg: groupActor?.img,
        specialImg: dynamicSpecialImg,
        masterImg: DSA5GodsMenuConfig.chipIcon('Mask'),
        activeTab: app.tabGroups.sheet,
        personalSchips,
        groupSchips,
        specialSchips,
        masterSchips,
        isPersonalPool: app.selectedPool === 'personal',
        isGroupPool: app.selectedPool === 'group',
        isSpecialPool: app.selectedPool === 'special',
        isMasterPool: app.selectedPool === 'master',
        specialSchipDescription,
        addQSDesc,
        masterDesc,
        masterCost,
        hasPersonal,
        hasGroup: hasGroupSchips,
        hasSpecial: hasSpecialSchips,
        hasMaster,
        hasMultiplePools: availablePoolsCount > 1,
        hasFateAction,
        isGM: game.user.isGM,
    };
}
