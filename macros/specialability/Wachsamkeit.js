const lang = game.i18n.lang === "de" ? "de" : "en";

const dict = {
    de: {
        fallbackTitle: "Überraschung abschütteln",
        notEnoughSchips: (name) => `${name} hat nicht genügend Schicksalspunkte.`,
        notSurprised: (name) => `${name} ist aktuell nicht überrascht.`,
        tabDesc: "Gib 1 Schip aus, um den Status <i>Überrascht</i> aufzuheben.",
        effectDetail: "Hebt den Status <i>Überrascht</i> auf.",
        chatMessage: (name, itemName) => `<b>${name}</b> setzt einen Schicksalspunkt ein (${itemName}) und hebt den Status <i>Überrascht</i> auf.`,
    },
    en: {
        fallbackTitle: "Shake Off Surprise",
        notEnoughSchips: (name) => `${name} does not have enough Fate Points.`,
        notSurprised: (name) => `${name} is not surprised.`,
        tabDesc: "Spend 1 Fate Point to remove the <i>Surprised</i> status.",
        effectDetail: "Removes the <i>Surprised</i> status.",
        chatMessage: (name, itemName) => `<b>${name}</b> spends a Fate Point (${itemName}) and removes the <i>Surprised</i> status.`,
    },
}[lang];

if (!actor) return;

if (!actor.hasCondition("surprised")) {
    ui.notifications.warn(dict.notSurprised(actor.name));
    return;
}

const { apps, concerns } = globalThis.dsa5;
const { DSA5_Utility, UnifiedFateDSA5 } = apps;
const { FateRolls } = concerns.Actor;

const registry = { AppClass: UnifiedFateDSA5 };
Hooks.callAll("dsa5.getFateSpendApp", registry);
const BaseClass = registry.AppClass;
const supportsSpecial = BaseClass !== UnifiedFateDSA5;

const getGroupSchips = () => {
    const [current = 0, max = 0] = (game.settings.get("dsa5", "groupschips") || "0/0").split("/").map(Number);
    return { current, max };
};

const hasUsableSchip = () => {
    if ((actor.system?.status?.fatePoints?.value || 0) > 0) return true;
    if (getGroupSchips().current > 0) {
        const partyUuid = game.settings.get("dsa5", "primaryParty");
        const group = (partyUuid ? fromUuidSync(partyUuid) : null) || game.actors.find((a) => a.type === "group");
        if (Object.values(group?.system?.members ?? {}).some((m) => m.uuid === actor.uuid)) return true;
    }
    if (!supportsSpecial) return false;
    const special = foundry.utils.getProperty(actor, "flags.dsa5.specialPoints");
    return !!special && Object.values(special).some((p) => (Number(p?.current) || 0) > 0);
};

if (!hasUsableSchip()) {
    ui.notifications.warn(dict.notEnoughSchips(actor.name));
    return;
}

const TAB_ID = "macroAbility";
const abilityName = item?.name || dict.fallbackTitle;

const virtualMessage = {
    id: null,
    content: "",
    speaker: ChatMessage.getSpeaker({ actor }),
    author: game.user,
    isOwner: true,
    flags: {
        dsa5: {},
        img: { src: actor.img },
        data: {
            messageMode: args?.messageMode || game.settings.get("core", "messageMode"),
            preData: { source: { name: "", type: "specialability" } },
            postData: { successLevel: 0 },
        },
    },
    update: async () => {},
};

class AbilityFateApp extends BaseClass {
    isStandardFateTab = false;
    #isHandlingConfirm = false;

    constructor(message, targetActor) {
        super(message, targetActor);
        this.tabGroups.sheet = TAB_ID;
    }

    _canSelectPool(pool, key) {
        return pool !== "master" && super._canSelectPool(pool, key);
    }

    _validateDieSelection() {
        return this.tabGroups.sheet === TAB_ID || super._validateDieSelection();
    }

    async _buildFateContext(baseContext) {
        const context = await super._buildFateContext(baseContext);
        this.tabGroups.sheet = TAB_ID;

        const pools = { personal: !!context.hasPersonal, group: !!context.hasGroup, special: !!context.hasSpecial };
        if (!pools[this.selectedPool]) {
            this.selectedPool = ["personal", "group", "special"].find((p) => pools[p]) ?? "personal";
        }
        if (context.specialSchips?.length) {
            context.specialSchips.forEach((s) => { s.isRelevant = false; });
            if (this.selectedPool === "special" && !this.selectedSpecialKey) {
                const firstFull = context.specialSchips.find((s) => s.cssClass.includes("fullSchip"));
                if (firstFull) {
                    this.selectedSpecialKey = firstFull.key;
                    context.specialSchips.forEach((s) => { s.isSelected = s.key === firstFull.key; });
                }
            }
        }

        const poolCount = Object.values(pools).filter(Boolean).length;
        return Object.assign(context, {
            activeTab: TAB_ID,
            tabs: { [TAB_ID]: { id: TAB_ID, label: abilityName, cssClass: "active" } },
            hasMaster: false,
            masterSchips: [],
            isMasterPool: false,
            activeSpecialTab: null,
            activeSpecialTabs: [],
            xeledonTabs: {},
            regenBlessingTabs: [],
            showActorHeader: false,
            isPersonalPool: this.selectedPool === "personal",
            isGroupPool: this.selectedPool === "group",
            isSpecialPool: this.selectedPool === "special",
            hasMultiplePools: poolCount > 1,
            hasFateAction: poolCount > 0,
        });
    }

    async _onRender(context, options) {
        await super._onRender(context, options);

        const section = document.createElement("section");
        section.className = "tab active";
        section.dataset.tab = TAB_ID;
        section.dataset.group = "sheet";
        section.innerHTML = `
            <div class="dialog-content standard-form">
                <h4 class="center">${foundry.utils.escapeHTML(abilityName)}</h4>
                <div class="description flexcol gap5px center dsa-info-box dsamt-4">
                    <p>${dict.tabDesc}</p>
                </div>
            </div>`;

        const container = this.element?.querySelector("section.content");
        if (container) return container.replaceChildren(section);

        const tabs = this.element?.querySelectorAll('section.tab[data-group="sheet"]');
        if (tabs?.length) {
            tabs[0].replaceWith(section);
            for (let i = 1; i < tabs.length; i++) tabs[i].remove();
        } else {
            this.element?.querySelector('nav[data-group="sheet"], nav.sheet-tabs')?.insertAdjacentElement("afterend", section);
        }
    }

    async _executeSheetAction({ cardOptions }) {
        if (this.tabGroups.sheet !== TAB_ID) return super._executeSheetAction?.({ cardOptions });

        if (!this.dsaActor.hasCondition("surprised")) {
            ui.notifications.warn(dict.notSurprised(this.dsaActor.name));
            return null;
        }

        await this.dsaActor.removeCondition("surprised");
        cardOptions.skipNativePostFunction = true;

        return {
            chatActionLabel: abilityName,
            chatRollDetails: `<p>${dict.effectDetail}</p>`,
        };
    }

    async _onConfirm(event, target, isCheat = false) {
        if (this.selectedPool === "special") return super._onConfirm(event, target, isCheat);

        event?.preventDefault?.();
        if (this.#isHandlingConfirm) return;
        this.#isHandlingConfirm = true;

        try {
            if (!this._validateSelectedPool()) return;
            if (!this.dsaActor.hasCondition("surprised")) {
                ui.notifications.warn(dict.notSurprised(this.dsaActor.name));
                return;
            }

            const pool = this.selectedPool;
            const isPersonal = pool === "personal";
            const { current: grpCur, max: grpMax } = isPersonal ? {} : getGroupSchips();
            const max = isPersonal ? (this.dsaActor.system.status.fatePoints.current || 0) : grpMax;
            const available = Math.max(0, (isPersonal ? (this.dsaActor.system.status.fatePoints.value || 0) : grpCur) - 1);
            const dots = Array.from({ length: Math.max(0, max) }, (_, i) => `<span class="schip tiny ${i < available ? "fullSchip" : "emptySchip"}"></span>`).join("");

            await this.dsaActor.removeCondition("surprised");

            const chatContent = `
                <div class="dsa5 chat-card"><div class="card-content">
                    <h5 class="center"><b>${_loc("CHATFATE.fatepointUsed")}</b></h5>
                    <p class="center">${dict.chatMessage(foundry.utils.escapeHTML(this.dsaActor.name), foundry.utils.escapeHTML(abilityName))}</p>
                    <div class="row-section center" data-tooltip="${_loc(isPersonal ? "CHATFATE.PointsRemaining" : "CHATFATE.GroupPointsRemaining")}">${dots}</div>
                </div></div>`;
            await ChatMessage.create(DSA5_Utility.chatDataSetup(chatContent, args?.messageMode));

            const source = isPersonal ? FateRolls.SCHIP_SOURCES.PERSONAL : FateRolls.SCHIP_SOURCES.GROUP;
            await FateRolls.reduceSchips(this.dsaActor, source, { tossCoin: false });
            Hooks.callAll("dsa5.fatePointSpent", { actor: this.dsaActor, pool, amount: 1 });
            await this.close();
        } finally {
            this.#isHandlingConfirm = false;
        }
    }
}

new AbilityFateApp(virtualMessage, actor).render(true);
