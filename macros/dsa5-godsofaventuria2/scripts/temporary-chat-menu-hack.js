import UnifiedFateDSA5 from './unified-fate-gui.js';

export const addUnifiedFateContextOption = (app, options) => {
    // 1. Löschen der originalen Schipoptionen aus dem Chatkontext
    const systemFateLabels = [
        'CHATCONTEXT.Reroll', 'CHATCONTEXT.RerollGroup', 'CHATCONTEXT.talentedReroll',
        'CHATCONTEXT.AddQS', 'CHATCONTEXT.AddQSGroup', 'CHATCONTEXT.rerollDamage',
        'CHATCONTEXT.rerollDamageGroup', 'CHATCONTEXT.improveFate', 'CHATCONTEXT.improveFateGroup'
    ];

    for (let i = options.length - 1; i >= 0; i--) {
        if (options[i].label && systemFateLabels.includes(options[i].label)) {
            options.splice(i, 1);
        }
    }

    // Hilfsfunktion zum Öffnen des GUIs
    const openGui = (li) => {
        const el = li.length ? li[0] : li;
        const messageId = el.dataset?.messageId;
        const message = game.messages.get(messageId);
        const actor = message.speaker?.actor ? game.actors.get(message.speaker.actor) : null;
        
        // Holen der Würfeldaten
        const rollData = message?.flags?.data?.postData?.roll || message?.flags?.data?.preData?.roll;
        
        if (actor && rollData) {
            const roll = rollData instanceof Roll ? rollData : Roll.fromData(rollData);
            
            new UnifiedFateDSA5(message, actor, roll, {}).render(true);
        }
    };

    // Wann darf der Master-Menüpunkt erscheinen?
    const masterCheck = (li) => {
        const el = li.length ? li[0] : li; 
        const messageId = el.dataset?.messageId;
        if (!messageId) return false;

        const message = game.messages.get(messageId);
        if (!message || !message.flags?.data?.preData) return false;
        
        const actor = message.speaker?.actor ? game.actors.get(message.speaker.actor) : null;
        if (!actor) return false;

        // A: Berechtigung
        const hasOwnership = actor.isOwner || game.user.isGM;
        if (!hasOwnership) return false;

        // B: Schicksals-Status
        const d = message.flags.data;
        const usedReroll = !!d.fatePointRerollUsed;
        const usedDamageReroll = !!d.fatePointDamageRerollUsed;
        const usedImprove = !!d.fateImproved;
        const usedAddQS = !!d.fatePointAddQSUsed;
        const usedSpecialKeys = d.fateSpecialUsed || []; // Liste der genutzten Spezialaktionen

        // C: Ressourcen
        const hasPersonal = (actor.system?.status?.fatePoints?.value || 0) > 0;
        
        let hasGroup = false;
        try {
            // Gibt esGruppenschips
            const groupRaw = game.settings.get('dsa5', 'groupschips') || "0/0";
            if (Number(groupRaw.split('/')[0]) > 0) {
                // Ist der Actor in der Gruppe
                const partyUuid = game.settings.get('dsa5', 'primaryParty');
                let groupActor = partyUuid ? fromUuidSync(partyUuid) : game.actors.find(a => a.type === "group");
                
                if (groupActor && groupActor.system && groupActor.system.members) {
                    const memberUuids = Object.values(groupActor.system.members).map(m => m.uuid);
                    if (memberUuids.includes(actor.uuid)) {
                        hasGroup = true;
                    }
                }
            }
        } catch(e) {}

        let hasAnySpecial = false;      // Spezialschips?
        let hasUnusedSpecialTab = false; // Spezialschips, deren Spezialaktion noch ungenutzt ist?
        
        const specialPoints = foundry.utils.getProperty(actor, "flags.dsa5.specialPoints");
        if (specialPoints) {
            for (const [k, p] of Object.entries(specialPoints)) {
                if ((p.current || 0) > 0) {
                    hasAnySpecial = true; 
                    if (!usedSpecialKeys.includes(k)) {
                        hasUnusedSpecialTab = true; 
                    }
                }
            }
        }

        // Meister-Schips?
        let hasMaster = false;
        if (game.user.isGM) {
            try {
                const masterRaw = game.settings.get('dsa5', 'masterschips') || "0/0";
                hasMaster = Number(masterRaw.split('/')[0]) > 0;
            } catch(e) {}
        }

        // 1. Abbruch: Wenn absolut keine Schips vorhanden
        if (!hasPersonal && !hasGroup && !hasAnySpecial && !hasMaster) return false;

        // Sind alle Standard-Aktionen verbraucht?
        const allBasicUsed = usedReroll && usedDamageReroll && usedImprove && usedAddQS;

        // Alle Standard-Aktionen sind weg + kein Spezial-Tab mehr
        if (allBasicUsed && !hasUnusedSpecialTab) return false;

        return true;
    };

    // 3. Meistermenüpunkt einbauen
    const menuText = game.i18n.has("FateTab.UseSchip") ? game.i18n.localize("FateTab.UseSchip") : "Schip verwenden";

    options.push({
        name: menuText, 
        label: menuText, 
        icon: '<i class="fas fa-coins fa-fw"></i>',
        condition: masterCheck, 
        visible: masterCheck,   
        callback: openGui,      
        onClick: (_event, li) => openGui(li) 
    });
};

// Hook-Registrierung
Hooks.on("getChatMessageContextOptions", addUnifiedFateContextOption);
Hooks.on("getNotificationChatMessageContextOptions", addUnifiedFateContextOption);
