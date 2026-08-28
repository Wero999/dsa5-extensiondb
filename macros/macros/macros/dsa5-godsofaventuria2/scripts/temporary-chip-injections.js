import { DSA5GodsMenuConfig } from './config.js';

// CSS INJEKTION (ist nur Platzhalter)
Hooks.once("init", () => {
    if (!document.getElementById('dsa5-gods-custom-css')) {
        const style = document.createElement('style');
        style.id = 'dsa5-gods-custom-css';
        style.innerHTML = `
            .custom-special-schips.gods-schip {
                background-size: 80% !important; 
                background-position: center center !important; 
                
                background-repeat: no-repeat !important;
                position: relative !important;
                transition: transform 0.2s ease !important;
            }
            
            .custom-special-schips.gods-schip:hover {
                transform: scale(1.2) !important;
                z-index: 10 !important;
            }
            
            /* 3. ÜBERLAPPUNG: 
               Bestimmt, wie nah der neue Chip an den linken Chip heranrutscht */
            .stackedSchips > .custom-special-schips.gods-schip {
                margin-left: -12px !important;
            }
        `;
        document.head.appendChild(style);
    }
});

// 2. Charakterbogen

function getSpecialChipsHTML(actor) {
    const specialPoints = foundry.utils.getProperty(actor, "flags.dsa5.specialPoints");
    if (!specialPoints) return "";

    let charHtml = "";
    const { godListNames, godIconMap, demonIconMap } = DSA5GodsMenuConfig;

    for (let [key, sData] of Object.entries(specialPoints)) {
        if ((sData?.value || 0) <= 0) continue;

        let isGod = godListNames.includes(key);
        let iconName = isGod ? (godIconMap[key] || "Alveran.png") : (demonIconMap[key] || "Erzdaemonen.png");
        let iconPath = `modules/dsa5-godsofaventuria2/icons/chips/${iconName}`;
        let name = game.i18n.localize(isGod ? `God.${key}.Name` : `Demon.${key}.Name`);
        let tooltip = `${name}-Schip`;

        for (let i = 1; i <= sData.value; i++) {
            let isFull = i <= sData.current;
            let filter = isFull ? "" : "filter: grayscale(100%) opacity(0.4);";
            
            charHtml += `\n<button type="button" data-action="customSpecialSchip" class="noBorder dsadesignbutton schip ${isFull ? 'fullSchip' : 'emptySchip'} gods-schip custom-special-schips" data-key="${key}" data-val="${i}" data-tooltip="${tooltip}" style="background-image: url('${iconPath}'); cursor: pointer; ${filter}"></button>`;
        }
    }
    return charHtml;
}

// 3. LOGIK & EVENT-LISTENER

async function handleChipClick(ev, actor) {
    ev.preventDefault();
    const btn = ev.currentTarget;
    const key = btn.dataset.key;
    let val = Number(btn.dataset.val);
    
    const path = `flags.dsa5.specialPoints.${key}`;
    const existing = foundry.utils.getProperty(actor, path);
    if (!existing) return;

    let available = existing.current || 0;
    if (val === 1 && available === 1) val = 0; 

    await actor.update({ [`${path}.current`]: val });
}

function bindChipListeners(container, actor) {
    if (!container) return;
    container.querySelectorAll('[data-action="customSpecialSchip"]').forEach(btn => {
        btn.addEventListener('click', ev => handleChipClick(ev, actor));
    });
}

// * 4. INJEKTIONS-HOOK

function tryInject(app, element) {
    const html = element instanceof HTMLElement ? element : element[0];
    const actor = app.document || app.actor;
    if (!actor || !html) return;

    html.querySelectorAll('.custom-special-schips').forEach(el => el.remove());
    const chipsHtml = getSpecialChipsHTML(actor);
    
    if (chipsHtml) {
        const ownSchip = html.querySelector('.ownSchips');
        if (ownSchip) {
            const target = ownSchip.closest('.stackedSchips');
            if (target) {
                target.insertAdjacentHTML('beforeend', chipsHtml);
                bindChipListeners(target, actor);
            }
        }
    }
}

// Verzögerung wg asynchrone V12-Rendering
Hooks.on("renderActorSheetdsa5Character", (app, element) => {
    setTimeout(() => tryInject(app, element), 50);
    setTimeout(() => tryInject(app, element), 250);
});
