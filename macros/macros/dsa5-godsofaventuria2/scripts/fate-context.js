import { DSA5GodsMenuConfig } from './config.js';
import { FateRolls } from '/systems/dsa5/modules/actor/concerns/faterolls.js';

export async function buildUnifiedFateContext(app, baseContext) {
    const data = app.message.flags.data;
    const postData = data.postData;
    const preData = data.preData;

    const rollName = preData.source?.name || "";

    const usedReroll = !!data.fatePointRerollUsed;
    const usedDamageReroll = !!data.fatePointDamageRerollUsed;
    const usedImprove = !!data.fateImproved;
    const usedAddQS = !!data.fatePointAddQSUsed;
    const usedSpecialKeys = data.fateSpecialUsed || [];
    const usedFieser = !!data.fieserSchadenUsed;
    const usedMeisterSchicksal = !!data.meisterSchicksalUsed;
    
    const damageRevealed = data.hideDamage === false || 
                           app.message.content.includes('data-hide-damage="false"') || 
                           app.message.content.includes('opposed-card');

    const successLevel = postData.successLevel || 0;
    const type = preData.source?.type;
    const mode = preData.mode;

    const { godListNames, godIconMap, demonIconMap } = DSA5GodsMenuConfig;

    const isCombatRoll = ['meleeweapon', 'rangeweapon', 'dodge', 'trait'].includes(type) || ['attack', 'parry', 'range'].includes(mode);
    const isAttack = mode === 'attack' || postData.characteristics?.some(c => c.char === 'attack');
    const isParry = mode === 'parry' || postData.characteristics?.some(c => c.char === 'parry');
    const isRange = type === 'rangeweapon' || mode === 'range';
    const isDodge = type === 'dodge' || preData.source?.name === game.i18n.localize("Dodge");

    let canImprove = false;

    const hasAbility = (key) => {
        const locName = game.i18n.localize(key);
        return app.dsaActor.items.some(i => i.name === locName && i.system?.category?.value === "fatePoints");
    };

    if (isAttack) {
        canImprove = hasAbility("FateAbility.AttackImprove");
    }
    else if (isRange) {
        canImprove = hasAbility("FateAbility.RangeImprove");
    }
    else if (isDodge) {
        canImprove = hasAbility("FateAbility.DodgeImprove");
    }
    else if (isParry) {
        canImprove = hasAbility("FateAbility.ParryImprove");
    }
    else if (type === 'attribute' || FateRolls.MULTI_DIE_ROLL_TYPES.includes(type)) {
        canImprove = hasAbility("FateAbility.AttributeImprove");
    }

    const hasD20Roll = !!postData.characteristics || !!preData.roll;
    const hasDamageRoll = !!postData.damageRoll;
    
    const canAddQS = successLevel > 0 && !usedAddQS && postData.qualityStep !== undefined && !isCombatRoll;

    const tabsDef = {};
    if (hasD20Roll && !usedReroll) tabsDef.reroll = { id: 'reroll', label: 'FateTab.Reroll', cssClass: app.tabGroups.sheet === 'reroll' ? 'active' : '' };
    if (hasDamageRoll && !usedDamageReroll) tabsDef.rerollDamage = { id: 'rerollDamage', label: game.i18n.localize('FateTab.RerollDamage'), cssClass: app.tabGroups.sheet === 'rerollDamage' ? 'active' : '' };
    if (hasD20Roll && canImprove && !usedImprove) tabsDef.improve = { id: 'improve', label: 'FateTab.Improve', cssClass: app.tabGroups.sheet === 'improve' ? 'active' : '' };
    if (canAddQS) tabsDef.addQS = { id: 'addQS', label: 'FateTab.AddQS', cssClass: app.tabGroups.sheet === 'addQS' ? 'active' : '' };

    const masterTabIds = ['beistand', 'fieser', 'gescheitert', 'meisterschicksal', 'masterPlaceholder'];

    if (!tabsDef[app.tabGroups.sheet] && !app.tabGroups.sheet.startsWith('specialAction_') && !masterTabIds.includes(app.tabGroups.sheet)) {
        app.tabGroups.sheet = Object.keys(tabsDef)[0];
        if (tabsDef[app.tabGroups.sheet]) tabsDef[app.tabGroups.sheet].cssClass = 'active';
    }

    const dice = (postData.characteristics || [])
        .filter(item => item.char !== 'damage')
        .map((item, i) => {
            let attr = item.char || 'd20';
            if (isCombatRoll) {
                attr = mode || type;
                if (type === 'dodge') attr = 'dodge';
            }
            return {
                index: i,
                currentValue: item.res,
                attr: attr,
                cssClass: item.suc ? 'suc' : 'fail',
                tooltip: item.tar ? `${game.i18n.localize(item.char === 'attack' ? 'Attack' : item.char === 'parry' ? 'Parry' : `CHAR.${item.char.toUpperCase()}`)} vs ${item.tar}` : '',
                selected: (app.tabGroups.sheet === 'reroll' || app.tabGroups.sheet === 'meisterschicksal') ? app.selectedForReroll.has(i) : app.selectedForImprove === i,
                specialSelected: app.tabGroups.sheet.startsWith('specialAction') ? app.selectedForSpecialReroll === i : false
            };
        });

    let damageDice = [];
    if (hasDamageRoll) {
        const rollInstance = postData.damageRoll instanceof Roll ? postData.damageRoll : Roll.fromData(postData.damageRoll);
        let dieIndex = 0;
        for (let term of rollInstance.terms) {
            if (term.results) {
                for (let res of term.results) {
                    damageDice.push({
                        index: dieIndex,
                        currentValue: res.result,
                        faces: term.faces || 6,
                        tooltip: game.i18n.localize('Trefferpunkte'),
                        selected: app.selectedForDamageReroll.has(dieIndex)
                    });
                    dieIndex++;
                }
            }
        }
    }

    const fateMax = app.dsaActor.system.status.fatePoints.current || 0; 
    const fateAvailable = app.dsaActor.system.status.fatePoints.value || 0;
    const personalTooltip = game.i18n.localize("FateTab.FatePoint");
    
    const personalSchips = Array.from({length: fateMax}, (_, i) => ({ 
        val: i + 1,
        cssClass: i < fateAvailable ? 'fullSchip' : 'emptySchip',
        tooltip: personalTooltip
    }));

    const groupSchipsString = game.settings.get('dsa5', 'groupschips') || "0/0";
    const [grpCur, grpMax] = groupSchipsString.split('/').map(Number);
    const groupTooltip = game.i18n.localize("FateTab.GroupFatePoint");
    
    const groupSchips = Array.from({length: grpMax || grpCur || 0}, (_, i) => ({ 
        val: i + 1,
        cssClass: i < grpCur ? 'fullSchip' : 'emptySchip',
        tooltip: groupTooltip
    }));
    
    let specialSchips = [];
    let activeSpecialTab = null;
    let hasGodChips = false;
    let hasDemonChips = false;

    const specialPointsObj = foundry.utils.getProperty(app.dsaActor, "flags.dsa5.specialPoints");
    if (specialPointsObj) {
        for (let [key, sData] of Object.entries(specialPointsObj)) {
            if ((sData?.value || 0) <= 0) continue;
            
            let isRelevant = false;
            let isQsAndReroll = false;

            const qsList = DSA5GodsMenuConfig.qsandreroll?.[key];
            if (qsList) {
                if (qsList.includes("ALL") || qsList.some(k => game.i18n.localize(k) === rollName)) {
                    isRelevant = true;
                    isQsAndReroll = true;
                }
            }

            const extraList = DSA5GodsMenuConfig.extra?.[key];
            if (!isRelevant && extraList) {
                if (extraList.includes("ALL") || extraList.some(k => game.i18n.localize(k) === rollName)) {
                    isRelevant = true;
                    isQsAndReroll = false;
                }
            }

            let isGod = godListNames.includes(key);
            if (isGod) hasGodChips = true;
            else hasDemonChips = true;

            let iconName = isGod ? (godIconMap[key] || "Alveran.png") : (demonIconMap[key] || "Erzdaemonen.png");
            let iconPath = `modules/dsa5-godsofaventuria2/icons/chips/${iconName}`;
            let translatedName = game.i18n.localize(isGod ? `God.${key}.Name` : `Demon.${key}.Name`);
            
            for (let i = 0; i < sData.value; i++) {
                let isFull = i < sData.current;
                let imgStyle = `background-image: url('${iconPath}');`;
                if (!isFull) {
                    imgStyle += " filter: grayscale(100%) opacity(0.4);";
                }

                if (isRelevant && isFull && app.selectedPool === 'special' && app.selectedSpecialKey === key && !usedSpecialKeys.includes(key)) {
                    if (isQsAndReroll) {
                        activeSpecialTab = {
                            id: `specialAction_${key}`,
                            label: `${translatedName}-Schip`,
                            cssClass: app.tabGroups.sheet === `specialAction_${key}` ? 'active' : ''
                        };
                    }
                }

                specialSchips.push({
                    key: key,
                    tooltip: `${translatedName}-Schip`,
                    imgStyle: imgStyle,
                    cssClass: isFull ? 'fullSchip' : 'emptySchip',
                    isRelevant: (isRelevant && isFull),
                    isSelected: (app.selectedPool === 'special' && app.selectedSpecialKey === key)
                });
            }
        }
    }
    
    let masterSchips = [];
    let hasMaster = false;
    
    if (game.user.isGM) {
        const masterRaw = game.settings.get('dsa5', 'masterschips') || "0/0";
        const [mCur, mMax] = masterRaw.split('/').map(Number);
        hasMaster = (mMax > 0);
        
        for (let i = 0; i < mMax; i++) {
            masterSchips.push({
                value: i + 1,
                cssClass: i < mCur ? 'fullSchip' : 'emptySchip',
                img: i < mCur ? 'systems/dsa5/icons/meisterschip.webp' : 'systems/dsa5/icons/gray_meisterschip.webp'
            });
        }
    }

    const masterTabsDef = {};
    const isPC = app.dsaActor.hasPlayerOwner;
    const hasD6Damage = damageDice.some(d => d.faces === 6);

    if (isPC && hasDamageRoll && hasD6Damage && damageRevealed) {
        masterTabsDef.beistand = { id: 'beistand', label: game.i18n.localize('FateTab.MasterDarkness'), cssClass: app.tabGroups.sheet === 'beistand' ? 'active' : '' };
    }
    if (!isPC && (isAttack || isRange) && hasDamageRoll && !usedFieser && !damageRevealed) {
        masterTabsDef.fieser = { id: 'fieser', label: game.i18n.localize('FateTab.MasterNastyDamage'), cssClass: app.tabGroups.sheet === 'fieser' ? 'active' : '' };
    }
    
    const isSuccess = successLevel > 0 || postData.result?.success || postData.success;
    const magicTypes = ["spell", "liturgy", "ritual", "ceremony", "magicalsign"];
    const isMagic = magicTypes.includes(type);
    
    // Variable für "Gescheitert"-Text 
    let isCrit = false;
    let failCost = 1;

    if (isPC && (isAttack || isRange) && isSuccess && !isMagic) {
        isCrit = (successLevel > 2) || postData.result?.critical;
        failCost = isCrit ? 3 : 2;
        
        if (game.user.isGM) {
            const masterRaw = game.settings.get('dsa5', 'masterschips') || "0/0";
            const mCur = Number(masterRaw.split('/')[0]);
            if (mCur >= failCost) {
                masterTabsDef.gescheitert = { 
                    id: 'gescheitert', 
                    label: "Gescheiterter Angriff",
                    cssClass: app.tabGroups.sheet === 'gescheitert' ? 'active' : '' 
                };
            }
        }
    }
    
    if (hasD20Roll && !usedMeisterSchicksal) {
        masterTabsDef.meisterschicksal = { id: 'meisterschicksal', label: game.i18n.localize('FateTab.MasterFate'), cssClass: app.tabGroups.sheet === 'meisterschicksal' ? 'active' : '' };
    }
    if (Object.keys(masterTabsDef).length === 0) {
        masterTabsDef.masterPlaceholder = { id: 'masterPlaceholder', label: game.i18n.localize('FateTab.MasterNoOption'), cssClass: app.tabGroups.sheet === 'masterPlaceholder' ? 'active' : '' };
    }

    let groupActor = null;
    const partyUuid = game.settings.get('dsa5', 'primaryParty');
    if (partyUuid) groupActor = fromUuidSync(partyUuid);
    if (!groupActor) groupActor = game.actors.find(a => a.type === "group"); 
    
    let isGroupMember = false;
    if (groupActor && groupActor.system && groupActor.system.members) {
        const memberUuids = Object.values(groupActor.system.members).map(m => m.uuid);
        isGroupMember = memberUuids.includes(app.dsaActor.uuid);
    }

    const hasPersonal = personalSchips.length > 0;
    const hasGroupSchips = groupSchips.length > 0 && isGroupMember;
    const hasSpecialSchips = specialSchips.length > 0;

    let poolValid = false;
    if (app.selectedPool === 'personal' && hasPersonal) poolValid = true;
    if (app.selectedPool === 'group' && hasGroupSchips) poolValid = true;
    if (app.selectedPool === 'special' && hasSpecialSchips) poolValid = true;
    if (app.selectedPool === 'master' && hasMaster) poolValid = true;

    if (!poolValid) {
        if (hasPersonal) app.selectedPool = 'personal';
        else if (hasGroupSchips) app.selectedPool = 'group';
        else if (hasSpecialSchips) app.selectedPool = 'special';
        else if (hasMaster) app.selectedPool = 'master';
    }

    if (app.selectedPool === 'master') {
        for (let key in tabsDef) delete tabsDef[key]; 
        Object.assign(tabsDef, masterTabsDef);
        
        if (!tabsDef[app.tabGroups.sheet]) {
            const firstMasterKey = Object.keys(tabsDef)[0];
            app.tabGroups.sheet = firstMasterKey;
            tabsDef[firstMasterKey].cssClass = 'active';
        }
        activeSpecialTab = null; 
        
    } else if (activeSpecialTab && !tabsDef[app.tabGroups.sheet]) {
    } else if (!activeSpecialTab && (app.tabGroups.sheet.startsWith('specialAction_') || masterTabIds.includes(app.tabGroups.sheet))) {
        app.tabGroups.sheet = Object.keys(tabsDef)[0];
        if (tabsDef[app.tabGroups.sheet]) tabsDef[app.tabGroups.sheet].cssClass = 'active';
    }

    let availablePoolsCount = 0;
    if (hasPersonal) availablePoolsCount++;
    if (hasGroupSchips) availablePoolsCount++;
    if (hasSpecialSchips) availablePoolsCount++;
    if (hasMaster) availablePoolsCount++;
    
    let dynamicSpecialImg = "modules/dsa5-godsofaventuria2/icons/chips/Alveran.png";
    if (hasDemonChips && !hasGodChips) {
        dynamicSpecialImg = "modules/dsa5-godsofaventuria2/icons/chips/Erzdaemonen.png";
    }

    let specialSchipDescription = game.i18n.localize("FateTab.SpecialSchipHint");
    if (app.selectedPool === 'special' && app.selectedSpecialKey) {
        const isGod = godListNames.includes(app.selectedSpecialKey);
        const descKey = isGod ? `God.${app.selectedSpecialKey}.Description` : `Demon.${app.selectedSpecialKey}.Description`;
        specialSchipDescription = game.i18n.localize(descKey);
    }
	
    // Dynamische Beschreibung für die QS-Erhöhung
    let addQSDesc = game.i18n.localize("FateTab.AddQSDesc"); 
    if (app.selectedPool === 'special' && app.selectedSpecialKey) {
        const qsList = DSA5GodsMenuConfig.qsandreroll?.[app.selectedSpecialKey];
        if (qsList && (qsList.includes("ALL") || qsList.some(k => game.i18n.localize(k) === rollName))) {
            addQSDesc = game.i18n.localize("FateTab.AddQSDescSpecial");
        }
    }

    let masterDesc = "";
    let masterCost = "";
    if (app.selectedPool === 'master' && app.tabGroups.sheet === 'gescheitert') {
        masterDesc = game.i18n.localize("FateTab.MasterFailedDescFull");
        const attackType = isCrit ? game.i18n.localize("FateTab.CritAttack") : game.i18n.localize("FateTab.RegularAttack");
        masterCost = game.i18n.format("FateTab.MasterFailedCostDetail", { type: attackType, cost: failCost });
    }

    return {
        ...baseContext,
        tabs: tabsDef,
        dice,
        damageDice,
        actorImg: app.dsaActor.img || "icons/svg/mystery-man-black.svg",
        groupImg: groupActor?.img || "icons/svg/mystery-man-black.svg",
        specialImg: dynamicSpecialImg,
        masterImg: "modules/dsa5-godsofaventuria2/icons/chips/Mask.png", // Bild habe ich aus "Aventurische Meisterschaft" extrahiert
        activeTab: app.tabGroups.sheet,
        personalSchips, 
        groupSchips, 
        specialSchips,
        masterSchips,
        activeSpecialTab,
        isPersonalPool: app.selectedPool === 'personal',
        isGroupPool: app.selectedPool === 'group',
        isSpecialPool: app.selectedPool === 'special',
        isMasterPool: app.selectedPool === 'master',
        specialSchipDescription,
        masterDesc,
        masterCost,
        hasPersonal: hasPersonal,
        hasGroup: hasGroupSchips,
        hasSpecial: hasSpecialSchips,
        hasMaster: hasMaster,
        hasMultiplePools: availablePoolsCount > 1,
        isGM: game.user.isGM
    };
}
