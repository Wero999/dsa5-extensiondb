import GodsMenu from "../scripts/gods-menu.js";
import UnifiedFateDSA5 from "../scripts/unified-fate-gui.js";
import "../scripts/master-fate.js";
import "../scripts/temporary-chip-injections.js";

Hooks.once("ready", () => {
    if (game.dsa5?.apps?.GroupAPI) {
        game.dsa5.apps.GroupAPI.registerHelper('dsa5-godsofaventuria2.godsmenu', {
            section: 'gm-tools', 
            label: 'Title', 
            icon: 'modules/dsa5-godsofaventuria2/icons/chips/Alveran.png', 
            hint: 'MASTER.randomGenOpen', 
            sort: 42, 
            gmOnly: true, 
            execute(groupActor) {
                new GodsMenu().render(true);
            },
        });
    }
});

