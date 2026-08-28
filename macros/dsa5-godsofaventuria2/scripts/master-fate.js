Hooks.once("init", () => {
    game.settings.register("dsa5", "masterschips", {
        name: 'masterFatePoints',
        hint: 'masterFatePoints',
        scope: 'world',
        config: false,
        default: '0/0',
        type: String,
        onChange: async () => {
            if (game.user.isGM && game.dsa5 && game.dsa5.apps.gameMasterMenu) {
                game.dsa5.apps.gameMasterMenu.render();
            }
        },
    });
});

Hooks.once("ready", () => {
    
    // Erweiterung von Rulechaos
    if (game.dsa5 && game.dsa5.apps && game.dsa5.apps.RuleChaos) {
        game.dsa5.apps.RuleChaos.getMasterSchips = function() {
            const schipSetting = game.settings
                .get('dsa5', 'masterschips')
                .split('/')
                .map((x) => Number(x));
            
            const masterschips = [];
            for (let i = 1; i <= schipSetting[1]; i++) {
                masterschips.push({
                    value: i,
                    cssClass: i <= schipSetting[0] ? 'fullSchip' : 'emptySchip',
                    img: i <= schipSetting[0] ? 'systems/dsa5/icons/meisterschip.webp' : 'systems/dsa5/icons/gray_meisterschip.webp'
                });
            }
            return masterschips;
        };
        console.log("DSA5 Gods Menu | ---> RuleChaos wurde erfolgreich um getMasterSchips erweitert!");
    }

    // Erweiterung des Meistermenüs
    if (!game.user.isGM) return;

    const gmMenu = game.dsa5?.apps?.gameMasterMenu;
    if (!gmMenu) return;

    // Template auf deine eigene Datei umleiten
    gmMenu.constructor.PARTS.main.template = "modules/dsa5-godsofaventuria2/templates/master_menu.hbs";

    // Klick-Logik als Funktionen definieren
    const addMasterSchipAction = async function(ev, target) {
        const val = Number(target.dataset.value);
        const setting = game.settings.get('dsa5', 'masterschips').split('/').map(Number);
        
        setting[1] = Math.max(0, setting[1] + val);
        setting[0] = Math.min(setting[1], setting[0]);
        
        await game.settings.set('dsa5', 'masterschips', setting.join('/'));
    };

    const masterSchipAction = async function(ev, target) {
        let val = Number(target.getAttribute('data-val'));
        if (val === 1 && $(target).closest('.col').find('.fullSchip').length === 1) val = 0;
        
        const setting = game.settings.get('dsa5', 'masterschips').split('/').map(Number);
        setting[0] = val;
        
        await game.settings.set('dsa5', 'masterschips', setting.join('/'));
    };

    // Aktionen in die laufende Instanz des Menüs schreiben!
    if (gmMenu.options && gmMenu.options.actions) {
        gmMenu.options.actions.addMasterSchip = addMasterSchipAction;
        gmMenu.options.actions.masterschip = masterSchipAction;
    }

    // Aktionen zusätzlich in den Bauplan schreiben
    if (gmMenu.constructor.DEFAULT_OPTIONS && gmMenu.constructor.DEFAULT_OPTIONS.actions) {
        gmMenu.constructor.DEFAULT_OPTIONS.actions.addMasterSchip = addMasterSchipAction;
        gmMenu.constructor.DEFAULT_OPTIONS.actions.masterschip = masterSchipAction;
    }

    // Den Rendering-Kontext anpassen
    const originalPrepareContext = gmMenu._prepareContext;
    gmMenu._prepareContext = async function(_options) {
        const data = await originalPrepareContext.call(this, _options);

        if (game.dsa5.apps.RuleChaos.getMasterSchips) {
            data.masterschips = game.dsa5.apps.RuleChaos.getMasterSchips();
        }
        
        return data;
    };
});
