const lang = game.i18n.lang == "de" ? "de" : "en";

const dict = {
    de: {
        // GUI Texte
        noActor: "Kein Actor gefunden. Bitte Makro als Item-Makro nutzen oder einen Token auswählen.",
        header: "»Jetzt erstmal ein Pfeifchen.«",
        description: "Tabak wird teilweise mit Kräutern oder Früchten aromatisiert oder pur geraucht, wobei billigerer Tabak besonders im Norden mit anderen Pflanzenteilen gestreckt ist, die selten zur Verbesserung des Geschmacks beitragen.",
        question: "Was möchtest du rauchen?",
        btnTobacco: "Nur Tabak",
        btnMixed: "Tabak und Kräuter",
        btnHerbs: "Nur Kräuter",
        placeholder: "Wähle eine Option oben.",
        labelTobacco: "Tabak",
        labelHerb: "Kraut",
        slotTooltip: "Klicken um Sheet zu öffnen",
        noItems: "Keine Items",
        dialogTitle: "Rauchwerk Auswahl",
        smoke: "Rauchen",
        cancel: "Abbrechen",
        noSelection: "Du hast nichts zum Rauchen ausgewählt!",
        chatMessage: "zündet sich genüsslich eine Pfeife an.",

        // Item Namen (Deutsch)
        tobaccoNames: [
            "Knaster",
            "Methumis-Tabak",
            "Mochorka, norbardischer Tabak",
            "Mohacca",
            "Sinoda-Kraut",
            "Tabak",
            "Tabak, Standard"
        ],
        herbNames: [
            "Cheriacha",
            "Schwarzer Pfeffer",
            "Rauschkraut",
            "Ilmenblatt",
            "Ilmenblatt-Rauchpäckchen",
            "Kukuka",
            "Purpurmohn",
            "Schleiermoos"
        ]
    },
    en: {
        // GUI Texts
        noActor: "No actor found. Please use as Item Macro or select a token.",
        header: "»Time for a little pipe.«",
        description: "Tobacco is sometimes flavored with herbs or fruits or smoked pure, although cheaper tobacco, especially in the north, is stretched with other plant parts that rarely contribute to improving the taste.",
        question: "What would you like to smoke?",
        btnTobacco: "Tobacco only",
        btnMixed: "Tobacco & Herbs",
        btnHerbs: "Herbs only",
        placeholder: "Choose an option above.",
        labelTobacco: "Tobacco",
        labelHerb: "Herb",
        slotTooltip: "Click to open sheet",
        noItems: "No items",
        dialogTitle: "Select Smoking Goods",
        smoke: "Smoke",
        cancel: "Cancel",
        noSelection: "You haven't selected anything to smoke!",
        chatMessage: "lights a pipe with pleasure.",

        // Item Names 
        tobaccoNames: [
            "Knaster",
            "Methumis Tobacco",
            "Mochorka, Norbardian Tobacco",
            "Mohacca",
            "Sinoda Herb",
            "Tobacco",
            "Tobacco, Standard"
        ],
        herbNames: [
            "Cheriacha",
            "Black Pepper",
            "Dreamweed",
            "Ilmen Leaf",
            "Ilmen Leaf Pack",
            "Kukuka",
            "Purple Poppy",
            "Veil Moss"
        ]
    }
}[lang];


// Sicherheitscheck
if (typeof actor === 'undefined' || !actor) {
    ui.notifications.warn(dict.noActor);
    return;
}


function findItems(names) {
    return actor.items.filter(i => names.includes(i.name) && i.system.quantity.value > 0);
}

const availableTobacco = findItems(dict.tobaccoNames);
const availableHerbs = findItems(dict.herbNames);

let selectedTobaccoId = null;
let selectedHerbId = null;

let content = `
<div class="dsa5-smoking-macro" style="height: 100%; overflow-y: auto; padding-bottom: 10px;">

    <div style="margin-bottom: 10px;">
        <p style="font-family: 'Times New Roman', serif; font-size: 10pt; font-style: italic; margin-bottom: 5px;">${dict.header}</p>
    </div>

    <div style="margin-bottom: 10px;">
        <p>${dict.description}</p>
        <p><i>${dict.question}</i></p>
    </div>

    <div class="mode-buttons" style="display: flex; justify-content: space-between; margin-bottom: 15px;">
        <button class="mode-btn" data-mode="tobacco">${dict.btnTobacco}</button>
        <button class="mode-btn" data-mode="mixed">${dict.btnMixed}</button>
        <button class="mode-btn" data-mode="herbs">${dict.btnHerbs}</button>
    </div>

    <div id="selection-area">
        <p style="text-align: center; color: #666;">${dict.placeholder}</p>
    </div>
</div>
`;

// Dialog
let d = new Dialog({
    title: dict.dialogTitle,
    content: content,
    buttons: {
        smoke: {
            icon: '<i class="fas fa-smoking"></i>',
            label: dict.smoke,
            callback: async (html) => {
                if (!selectedTobaccoId && !selectedHerbId) {
                    ui.notifications.warn(dict.noSelection);
                    return;
                }

                // Fluff-Text
                ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({actor: actor}),
                    content: `${actor.name} ${dict.chatMessage}`
                });

                // Effekt mit Self-Target auslösen
                const triggerItem = async (itemId) => {
                    const item = actor.items.get(itemId);
                    if(!item) return;

                    // Actor als Ziel setzen (Self Target)
                    const token = canvas.tokens.placeables.find(t => t.actor?.id === actor.id) || actor.getActiveTokens()[0];
                    if (token) {
                        token.setTarget(true, {user: game.user, releaseOthers: true});
                    }

                    try {
                        const setupPromise = item.setupEffect();
                        if (setupPromise && typeof setupPromise.then === 'function') {
                            setupPromise.then(setupData => {
                                item.itemTest(setupData);
                            });
                        } 
                    } catch (e) {
                        console.warn("Rauch-Makro: Fehler bei Effekt-Setup.", e);
                    }
                };

                // Tabak verarbeiten
                if (selectedTobaccoId) {
                    await triggerItem(selectedTobaccoId);
                    await consumeItem(selectedTobaccoId);
                }

                // Kraut verarbeiten
                if (selectedHerbId) {
                    await triggerItem(selectedHerbId);
                    await consumeItem(selectedHerbId);
                }
            }
        },
        cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: dict.cancel
        }
    },
    default: "smoke",
    render: (html) => {
        html.find('.mode-btn').click(ev => {
            const mode = ev.currentTarget.dataset.mode;
            updateSelectionArea(html, mode);
            selectedTobaccoId = null;
            selectedHerbId = null;
        });
    }
}, {
    width: 450,
    height: 'auto',
    resizable: true
});

d.render(true);


function updateSelectionArea(html, mode) {
    const container = html.find('#selection-area');
    let contentHTML = '';

    if (mode === 'tobacco') {
        contentHTML = buildSlotHTML(dict.labelTobacco, 'tobacco-slot', availableTobacco, 'tobacco-list');
    } else if (mode === 'herbs') {
        contentHTML = buildSlotHTML(dict.labelHerb, 'herb-slot', availableHerbs, 'herb-list');
    } else if (mode === 'mixed') {
        contentHTML = `
            <div style="display: flex; gap: 10px;">
                <div style="flex: 1;">${buildSlotHTML(dict.labelTobacco, 'tobacco-slot', availableTobacco, 'tobacco-list')}</div>
                <div style="flex: 1;">${buildSlotHTML(dict.labelHerb, 'herb-slot', availableHerbs, 'herb-list')}</div>
            </div>
        `;
    }

    container.html(contentHTML);
    attachItemListeners(html);
}

function buildSlotHTML(label, slotId, items, listClass) {
    let listHTML = `<div style="display: flex; flex-wrap: wrap; gap: 5px; margin-top: 10px;">`;

    items.forEach(item => {
        listHTML += `
            <div style="display: flex; flex-direction: column; align-items: center; width: 34px;">
                <div class="item-icon ${listClass}" data-id="${item.id}" title="${item.name}" 
                     style="width: 32px; height: 32px; border: 1px solid #999; cursor: pointer; background-image: url('${item.img}'); background-size: cover;">
                </div>
                <span style="font-size: 10px; color: #333; margin-top: 2px;">${item.system.quantity.value}</span>
            </div>`;
    });
    listHTML += `</div>`;

    return `
        <div style="text-align: center; margin-bottom: 10px;">
            <label style="font-weight: bold;">${label}</label>

            <div id="${slotId}" title="${dict.slotTooltip}"
                 style="width: 48px; height: 48px; border: 2px dashed #777; margin: 5px auto; background-size: cover; background-position: center; cursor: pointer;">
            </div>

            <div id="${slotId}-name" style="min-height: 1.2em; font-size: 0.9em; font-weight: bold; color: #444; margin-bottom: 5px;"></div>

            <div style="margin-top: 5px; border-top: 1px solid #ccc; padding-top: 5px;">
                ${items.length > 0 ? listHTML : `<p style="font-size: 0.8em; color: #999;">${dict.noItems}</p>`}
            </div>
        </div>
    `;
}

function attachItemListeners(html) {

    // TABAK LOGIK
    html.find('.tobacco-list').click(ev => {
        const id = ev.currentTarget.dataset.id;
        const item = actor.items.get(id);
        selectedTobaccoId = id;

        html.find('#tobacco-slot').css('background-image', `url('${item.img}')`);
        html.find('#tobacco-slot').css('border', `2px solid #000`);
        html.find('#tobacco-slot-name').text(item.name);
    });

    html.find('#tobacco-slot').click(ev => {
        if(selectedTobaccoId) {
            const item = actor.items.get(selectedTobaccoId);
            if(item) item.sheet.render(true);
        }
    });

    html.find('.tobacco-list').dblclick(ev => {
        const id = ev.currentTarget.dataset.id;
        actor.items.get(id)?.sheet.render(true);
    });

    // KRAUT LOGIK
    html.find('.herb-list').click(ev => {
        const id = ev.currentTarget.dataset.id;
        const item = actor.items.get(id);
        selectedHerbId = id;

        html.find('#herb-slot').css('background-image', `url('${item.img}')`);
        html.find('#herb-slot').css('border', `2px solid #000`);
        html.find('#herb-slot-name').text(item.name);
    });

    html.find('#herb-slot').click(ev => {
        if(selectedHerbId) {
            const item = actor.items.get(selectedHerbId);
            if(item) item.sheet.render(true);
        }
    });

    html.find('.herb-list').dblclick(ev => {
        const id = ev.currentTarget.dataset.id;
        actor.items.get(id)?.sheet.render(true);
    });
}

async function consumeItem(itemId) {
    const item = actor.items.get(itemId);
    if (!item) return;

    const currentQty = item.system.quantity.value;

    if (currentQty <= 1) {
        await actor.deleteEmbeddedDocuments("Item", [itemId]);
    } else {
        await actor.updateEmbeddedDocuments("Item", [{_id: itemId, "system.quantity.value": currentQty - 1}]);
    }
}
