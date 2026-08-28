import { DSA5GodsMenuConfig } from './config.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export default class GodsMenu extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor(app) {
        super(app);
        this.actor = null;
        this.trackedId = null;
        this.selectedItem = null;
    }

    static DEFAULT_OPTIONS = {
        classes: ['dsa5', 'largeDialog', 'godsMenu', 'sheet'],
        window: { title: 'Title', resizable: true, contentClasses: ['standard-form'] },
        position: { width: 570, height: 'auto' },
        actions: {
            openChar: this._onOpenChar,
            quickSelectActor: this.#quickSelectActor,
            unselectActor: this.#unselectActor,
            schipUpdate: this._onSchipUpdate,
            specialSchipUpdate: this._onSpecialSchipUpdate,
            openDetail: this._onOpenDetail,
            closeDetail: this._onCloseDetail,
            swapEffect: this._onSwapEffect,
            resetSchips: this._onResetSchips
        }
    };

    static _onOpenChar(ev, target) { this.actor?.sheet.render(true); }
    
    static #quickSelectActor(ev, target) {
        const actor = game.actors.get(target.dataset.actorId);
        if (actor) { this.trackedId = actor.id; this.actor = actor; this.render(true); }
    }
    
    static #unselectActor(ev, target) { this.actor = null; this.trackedId = null; this.render(true); }
    
    static async _onSchipUpdate(ev, target) {
        if (!this.actor) {
            ui.notifications.error(game.i18n.localize("ErrorNoActorSelected"));
            return;
        }
        let val = Number(target.dataset.val);
        const available = this.actor.system.status.fatePoints.value || 0;
        if (val === 1 && available === 1) val = 0;
        await this.actor.update({ 'system.status.fatePoints.value': val });
        this.render(true);
    }

    static async _onSpecialSchipUpdate(ev, target) {
        if (!this.actor) {
            ui.notifications.error(game.i18n.localize("ErrorNoActorSelected"));
            return;
        }
        const key = target.dataset.key;
        let val = Number(target.dataset.val);
        const path = `flags.dsa5.specialPoints.${key}`;
        const existing = foundry.utils.getProperty(this.actor, path);
        if (!existing) return;

        let available = existing.current || 0;
        if (val === 1 && available === 1) val = 0;

        await this.actor.update({ [`${path}.current`]: val });
        this.render(true);
    }

    static async _onSwapEffect(ev, target) {
        if (!this.actor) {
            ui.notifications.error(game.i18n.localize("ErrorNoActorSelected"));
            return;
        }
        if (!this.selectedItem) return;

        const key = this.selectedItem.id;
        const type = this.selectedItem.type;
        if (!key) return;

        const namelessTraditionName = game.i18n.localize("Tradition (Nameless One)");
        const hasDemonMark = this.actor.items.some(i => i.type === "demonmark");
        const hasNamelessTradition = this.actor.items.some(i => i.name === namelessTraditionName);

        if ((hasDemonMark || hasNamelessTradition) && type === "gods" && key !== "Namenloser") {
            if (hasDemonMark) ui.notifications.error(game.i18n.format("DämonenpaktiererError", { name: this.actor.name }));
            else ui.notifications.error(game.i18n.format("NamenloserKultistError", { name: this.actor.name }));
            return;
        }

        const maxFp = this.actor.system.status.fatePoints.current || 0;
        const availableFp = this.actor.system.status.fatePoints.value || 0;

        if (maxFp <= 0) {
            ui.notifications.error(game.i18n.localize("ErrorNoFatePoints"));
            return;
        }

        const path = `flags.dsa5.specialPoints.${key}`;
        const existing = foundry.utils.getProperty(this.actor, path) || { value: 0, current: 0 };

        let updateData = {
            "system.status.fatePoints.current": Math.max(0, maxFp - 1),
            "system.status.fatePoints.value": Math.max(0, availableFp - 1),
            [`${path}.value`]: (existing.value || 0) + 1,
            [`${path}.current`]: (existing.current || 0) + 1
        };

        await this.actor.update(updateData);
        this.render(true);
    }

    static async _onResetSchips(ev, target) {
        if (!this.actor) {
            ui.notifications.error(game.i18n.localize("ErrorNoActorSelected"));
            return;
        }

        const specialPoints = foundry.utils.getProperty(this.actor, "flags.dsa5.specialPoints");
        let totalRefund = 0;

        if (specialPoints) {
            for (const sData of Object.values(specialPoints)) {
                if (sData) totalRefund += (sData.value || 0);
            }
        }

        const currentMax = this.actor.system.status.fatePoints.current || 0;
        const currentAvailable = this.actor.system.status.fatePoints.value || 0;

        let updateData = {
            "system.status.fatePoints.current": currentMax + totalRefund,
            "system.status.fatePoints.value": currentAvailable + totalRefund,
            "flags.dsa5.specialPoints": null 
        };

        await this.actor.update(updateData);
        this.render(true);
    }

    static _onOpenDetail(ev, target) {
        this.selectedItem = {
            id: target.dataset.id,
            name: target.dataset.name,
            icon: target.dataset.icon,
            type: target.dataset.type,
            description: target.dataset.description
        };
        this.render(true);
    }

    static _onCloseDetail(ev, target) {
        this.selectedItem = null;
        this.render(true);
    }

    static TABS = {
        sheet: { tabs: [{ id: 'gods', label: 'TabGods' }, { id: 'archdemons', label: 'TabDemons' }], initial: 'gods' }
    }

    static PARTS = {
        header: { template: 'modules/dsa5-godsofaventuria2/templates/header.hbs' },
        tabs: { template: 'modules/dsa5-godsofaventuria2/templates/tabs.hbs' },
        gods: { template: 'modules/dsa5-godsofaventuria2/templates/gods.hbs' },
        archdemons: { template: 'modules/dsa5-godsofaventuria2/templates/archdemons.hbs' },
    };

    async getAvailableActors() {
        const trackedActors = game.settings.get('dsa5', 'trackedActors') || {};
        let actors;
        if (trackedActors.actors?.length > 0) {
            actors = game.actors.filter((x) => trackedActors.actors.includes(x.id))
                .sort((a, b) => trackedActors.actors.indexOf(a.id) - trackedActors.actors.indexOf(b.id));
        } else {
            actors = game.actors.filter((x) => x.hasPlayerOwner);
        }
        if (!game.user.isGM) actors = actors.filter((a) => a.isOwner);
        return actors;
    }

    async _prepareContext(_options) {
        const data = await super._prepareContext(_options);
        const availableActors = await this.getAvailableActors();

        if (!game.user.isGM && !this.actor) {
            this.actor = availableActors.length === 1 ? availableActors[0] : game.user.character;
        }

        let fatePoints = [];
        if (this.actor) {
            const maxFp = this.actor.system.status.fatePoints.current || 0;
            const availableFp = this.actor.system.status.fatePoints.value || 0;
            for (let i = 1; i <= maxFp; i++) {
                fatePoints.push({ val: i, cssClass: i <= availableFp ? "fullSchip" : "emptySchip" });
            }
        }

        const { godIconMap, demonIconMap, godListNames, demonListNames } = DSA5GodsMenuConfig;

        let specialPointsGroups = [];
        const specialPoints = foundry.utils.getProperty(this.actor, "flags.dsa5.specialPoints");
        if (this.actor && specialPoints) {
            for (let [key, sData] of Object.entries(specialPoints)) {
                if (!sData) continue;
                const total = sData.value || 0;
                const available = sData.current || 0;
                if (total <= 0) continue;

                let isGod = godListNames.includes(key);
                let iconName = isGod ? (godIconMap[key] || "Alveran.png") : (demonIconMap[key] || "Erzdaemonen.png");
                let icon = `modules/dsa5-godsofaventuria2/icons/chips/${iconName}`;

                let dots = [];
                for (let i = 1; i <= total; i++) {
                    let isFull = i <= available;
                    
                    let imgStyle = `background-image: url('${icon}');`;
                    if (!isFull) {
                        imgStyle = `background-image: url('${icon}'); filter: grayscale(100%) opacity(0.4);`;
                    }

                    let finalCss = isFull ? "fullSchip gods-schip" : "emptySchip gods-schip";
                    
                    dots.push({ val: i, cssClass: finalCss, imgStyle: imgStyle });
                }

                let translatedName = game.i18n.localize(`God.${key}.Name`);
                if (translatedName === `God.${key}.Name`) translatedName = game.i18n.localize(`Demon.${key}.Name`);

                specialPointsGroups.push({ key: key, name: translatedName, dots: dots });
            }
        }

        const gods = godListNames.map(name => {
            let iconName = godIconMap[name] || "Alveran.png";
            return {
                id: name,
                name: game.i18n.localize(`God.${name}.Name`),
                icon: `modules/dsa5-godsofaventuria2/icons/chips/${iconName}`,
                type: "gods",
                description: game.i18n.localize(`God.${name}.Description`)
            };
        });

        const demons = demonListNames.map(name => {
            let iconName = demonIconMap[name] || "Erzdaemonen.png";
            return {
                id: name,
                name: game.i18n.localize(`Demon.${name}.Name`),
                icon: `modules/dsa5-godsofaventuria2/icons/chips/${iconName}`, 
                type: "archdemons",
                description: game.i18n.localize(`Demon.${name}.Description`)
            };
        });

        let selectedGod = null;
        let selectedDemon = null;
        if (this.selectedItem) {
            if (this.selectedItem.type === 'gods') selectedGod = this.selectedItem;
            if (this.selectedItem.type === 'archdemons') selectedDemon = this.selectedItem;
        }

        return {
            ...data,
            actor: this.actor,
            availableActors: availableActors.map((a) => ({ id: a.id, name: a.name, img: a.img })),
            showActorSwitcher: availableActors.length > 1 || game.user.isGM,
            fatePoints: fatePoints,
            specialPointsGroups: specialPointsGroups,
            gods: gods,
            demons: demons,
            selectedGod: selectedGod,
            selectedDemon: selectedDemon,
            isDetailView: !!(selectedGod || selectedDemon)
        };
    }
}
