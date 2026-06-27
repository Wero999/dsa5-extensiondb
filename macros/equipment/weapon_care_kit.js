// Schema type: callMacroEffect
// Parameters injected by the system:
//   actor   {Actordsa5} - The target actor receiving the effect.
//   item    {Itemdsa5} - The item that triggered the effect.
//   source  {Itemdsa5} - The source item (same as item in this call).
//   qs      {number} - Quality step of the triggering roll (1-6).
//   args    {CallMacroEffectArgs} - Caller-provided arguments (includes args.result).
//   this    {OnUseEffect} - Helper instance.
// This is a system macro used for automation. It is disfunctional without the proper context.

const { ApplicationV2 } = foundry.applications.api;
const { getProperty } = foundry.utils;

const lang = game.i18n.lang == "de" ? "de" : "en";
const dict = {
    de: {
        desc: "Mit einem Waffenpflegeset kann ein Held die erste Stufe Beschädigung einer Waffe aufheben. Er muss dazu eine Probe auf das Herstellungstalent ablegen.",
        metalworking: "Metallbearbeitung",
        woodworking: "Holzbearbeitung",
        title: "Waffenpflegeset",
        noWeapons: "Keine reparierbaren Waffen gefunden.",
        selectWeapon: "Bitte wähle zuerst eine Waffe aus.",
        success: (name) => `${name} wurde erfolgreich repariert!`,
        fail: (name) => `Die Reparatur von ${name} ist fehlgeschlagen.`,
        noActor: "Kein Actor gefunden.",
        noSkill: (name) => `Talent \"${name}\" nicht gefunden.`,
    },
    en: {
        desc: "With a weapon care kit, you can remove the first level of damage. You must make a crafting talent check.",
        metalworking: "Metalworking",
        woodworking: "Woodworking",
        title: "Weapon Care Kit",
        noWeapons: "No repairable weapons found.",
        selectWeapon: "Please select a weapon first.",
        success: (name) => `${name} was successfully repaired!`,
        fail: (name) => `Repair of ${name} failed.`,
        noActor: "No actor found.",
        noSkill: (name) => `Skill \"${name}\" not found.`,
    },
}[lang];

const isRepairableWeapon = (entry) => {
    if (!["meleeweapon", "rangeweapon"].includes(entry.type)) {
        return false;
    }

    const maxStructure = getProperty(entry, "system.structure.max");
    const currentStructure = getProperty(entry, "system.structure.value");
    if (!maxStructure || maxStructure <= 0 || currentStructure === undefined) {
        return false;
    }

    const structureRatio = currentStructure / maxStructure;
    if (structureRatio >= 1) {
        return false;
    }

    return maxStructure <= 4 ? structureRatio > 0.65 : structureRatio >= 0.8;
};

const getEligibleWeapons = () => actor.items.filter(isRepairableWeapon);

const getSkillTokenId = () => actor.sheet?.getTokenId?.() ?? actor.getActiveTokens?.()[0]?.id ?? "";

const WEAPON_CARE_TEMPLATE = Handlebars.compile(`
    {{#if hasWeapons}}
    <div class="marginBottom">
        <p class="center"><i>{{desc}}</i></p>

        <div class="dsa-card-list thinscroll dsa-card-scroll-box">
            <ul>
                {{#each weapons}}
                <li>
                    <label data-action="selectWeapon" data-id="{{id}}">
                        <input type="radio" name="weaponChoice" value="{{id}}" {{#if selected}}checked{{/if}} />
                        <img src="{{img}}" width="40" height="40" class="dsa-card-icon-img"/>
                        <span>{{name}}</span>
                    </label>
                </li>
                {{/each}}
            </ul>
        </div>

        <div class="row-section gap5px margin-top">
            <button class="col two dsa5 button" data-action="repair" data-skill="{{metalworking}}" {{#if repairDisabled}}disabled{{/if}}>
                <i class="fas fa-hammer"></i> {{metalworking}}
            </button>
            <button class="col two dsa5 button" data-action="repair" data-skill="{{woodworking}}" {{#if repairDisabled}}disabled{{/if}}>
                <i class="fas fa-tree"></i> {{woodworking}}
            </button>
        </div>
    </div>
    {{else}}
    <div class="paddingBox center"><i>{{noWeapons}}</i></div>
    {{/if}}
`);

if (!actor) {
    ui.notifications.warn(dict.noActor);
    return;
}

class WeaponCareApp extends ApplicationV2 {
    static DEFAULT_OPTIONS = {
        id: "weapon-care-app",
        classes: ["dsa5"],
        window: { title: dict.title, resizable: true },
        position: { width: 420, height: "auto" },
        actions: {
            selectWeapon: this._onSelectWeapon,
            repair: this._onRepair,
        },
    };

    constructor(options) {
        super(options);
        this.selectedWeaponId = null;
    }

    async _prepareContext() {
        const weapons = getEligibleWeapons();
        if (this.selectedWeaponId && !weapons.some((weapon) => weapon.id === this.selectedWeaponId)) {
            this.selectedWeaponId = null;
        }

        return {
            desc: dict.desc,
            hasWeapons: weapons.length > 0,
            metalworking: dict.metalworking,
            noWeapons: dict.noWeapons,
            repairDisabled: !this.selectedWeaponId,
            weapons: weapons.map((weapon) => ({
                id: weapon.id,
                img: weapon.img,
                name: weapon.name,
                selected: this.selectedWeaponId === weapon.id,
            })),
            woodworking: dict.woodworking,
        };
    }

    async _renderHTML(context) {
        return WEAPON_CARE_TEMPLATE(context);
    }

    _replaceHTML(result, content) {
        content.innerHTML = result;
    }

    static _onSelectWeapon(_event, target) {
        const { id } = target.dataset;
        this.selectedWeaponId = this.selectedWeaponId === id ? null : id;
        this.render();
    }

    static async _onRepair(_event, target) {
        target.disabled = true;

        try {
            await this.executeRepair(target.dataset.skill);
        } finally {
            if (this.rendered) {
                this.render();
            }
        }
    }

    async executeRepair(skillName) {
        if (!this.selectedWeaponId) {
            ui.notifications.warn(dict.selectWeapon);
            return;
        }

        const skill = actor.items.find((entry) => entry.type === "skill" && entry.name === skillName);
        if (!skill) {
            ui.notifications.error(dict.noSkill(skillName));
            return;
        }

        try {
            const setupData = await actor.setupSkill(skill.toObject(), {}, getSkillTokenId());
            const testResult = await actor.basicTest(setupData);
            const successLevel = testResult?.result?.successLevel ?? 0;

            const weapon = actor.items.get(this.selectedWeaponId);
            if (!weapon) {
                return;
            }

            if (successLevel <= 0) {
                ui.notifications.warn(dict.fail(weapon.name));
                return;
            }

            await actor.updateEmbeddedDocuments("Item", [
                {
                    _id: weapon.id,
                    "system.structure.value": weapon.system.structure.max,
                },
            ]);

            ui.notifications.info(dict.success(weapon.name));
            this.selectedWeaponId = null;

            if (getEligibleWeapons().length === 0) {
                this.close();
                return;
            }

            this.render();
        } catch (err) {
            console.warn("Waffenpflege: Fehler bei der Probe.", err);
        }
    }
}

new WeaponCareApp().render(true);
