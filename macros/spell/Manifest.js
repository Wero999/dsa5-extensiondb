// This is a system macro used for automation. It is disfunctional without the proper context.

const lang = game.i18n.lang == "de" ? "de" : "en";

const dict = {
  de: {
    dialogTitle: "Elementare Manifestation",
    dialogText: "Der Zauberspruch ruft eine kleine Menge eines Elements herbei.<br><i>Welches Element möchtest du manifestieren?</i>",
    btnManifest: "Manifestieren",
    btnCancel: "Abbrechen",
    noActor: "Kein gültiges Ziel (Actor) vorhanden.",
    noSelection: "Bitte wähle ein Element aus.",
    elements: {
      humus: { name: "Humus", label: "Humusessenz", flavor: "Ein Klumpen fruchtbarer, warm pulsierender Erde" },
      fire:  { name: "Feuer", label: "Feueressenz", flavor: "Eine kleine, ewig tanzende Flamme" },
      air:   { name: "Luft",  label: "Luftessenz",  flavor: "Ein gefangener, wirbelnder Luftzug" },
      ice:   { name: "Eis",   label: "Eisessenz",   flavor: "Ein perfekt geformter, nie schmelzender Eiskristall" },
      water: { name: "Wasser",label: "Wasseressenz",flavor: "Eine schwebende Kugel reinsten Quellwassers" },
      ore:   { name: "Erz",   label: "Erzessenz",   flavor: "Ein Stück rohes, ungewöhnlich schweres Erz" }
    },
    chatInfo: "<i>{desc}</i> manifestiert sich im Besitz von <b>{name}</b> zu <b>{qs}x {item}</b>."
  },
  en: {
    dialogTitle: "Elemental Manifestation",
    dialogText: "The spell summons a small amount of an element.<br><i>Which element do you want to manifest?</i>",
    btnManifest: "Manifest",
    btnCancel: "Cancel",
    noActor: "No valid target (Actor) found.",
    noSelection: "Please select an element.",
    elements: {
      humus: { name: "Humus", label: "Humus Essence", flavor: "A lump of fertile, warm pulsing earth" },
      fire:  { name: "Fire",  label: "Fire Essence",  flavor: "A small, eternally dancing flame" },
      air:   { name: "Air",   label: "Air Essence",   flavor: "A trapped, swirling draft of air" },
      ice:   { name: "Ice",   label: "Ice Essence",   flavor: "A perfectly formed, never-melting ice crystal" },
      water: { name: "Water", label: "Water Essence", flavor: "A floating orb of purest spring water" },
      ore:   { name: "Ore",   label: "Ore Essence",   flavor: "A piece of raw, unusually heavy ore" }
    },
    chatInfo: "<i>{desc}</i> manifests in <b>{name}'s</b> possession into <b>{qs}x {item}</b>."
  }
}[lang];

if (!actor) {
    ui.notifications.warn(dict.noActor);
    return;
}

const content = `
  <style>
    .dialog-text {
      font-size: 1.1em;
      margin-bottom: 10px;
      line-height: 1.4;
    }
    
    .element-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 10px;
      margin-bottom: 10px;
    }
    .element-col {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .element-option {
      display: none;
    }
    .element-btn {
      display: block;
      padding: 8px;
      text-align: center;
      border: 1px solid #7a7971;
      background: rgba(0, 0, 0, 0.05);
      cursor: pointer;
      border-radius: 3px;
      font-weight: bold;
    }
    .element-option:checked + .element-btn {
      background: var(--color-shadow-highlight, #ff6400);
      color: white;
      border-color: black;
    }
  </style>

  <div class="dialog-text">${dict.dialogText}</div>
  
  <form>
    <div class="element-grid">
      <div class="element-col">
        <label>
          <input type="radio" name="element" value="humus" class="element-option">
          <span class="element-btn">${dict.elements.humus.name}</span>
        </label>
        <label>
          <input type="radio" name="element" value="fire" class="element-option">
          <span class="element-btn">${dict.elements.fire.name}</span>
        </label>
        <label>
          <input type="radio" name="element" value="air" class="element-option">
          <span class="element-btn">${dict.elements.air.name}</span>
        </label>
      </div>

      <div class="element-col">
        <label>
          <input type="radio" name="element" value="ice" class="element-option">
          <span class="element-btn">${dict.elements.ice.name}</span>
        </label>
        <label>
          <input type="radio" name="element" value="water" class="element-option">
          <span class="element-btn">${dict.elements.water.name}</span>
        </label>
        <label>
          <input type="radio" name="element" value="ore" class="element-option">
          <span class="element-btn">${dict.elements.ore.name}</span>
        </label>
      </div>
    </div>
  </form>
`;

new Dialog({
  title: dict.dialogTitle,
  content: content,
  buttons: {
    manifest: {
      icon: '<i class="fas fa-check"></i>',
      label: dict.btnManifest,
      callback: async (html) => {
        const selectedKey = html.find('input[name="element"]:checked').val();
        
        if (!selectedKey) {
          ui.notifications.warn(dict.noSelection);
          return;
        }

        const elData = dict.elements[selectedKey];
        
        const itemData = {
          name: elData.label,
          type: "consumable",
          img: "systems/dsa5/icons/categories/consumable.webp",
          system: {
            quantity: { value: qs }, 
            weight: { value: 0.05 },
            equipmentType: { value: "tools" }
          }
        };

        await actor.createEmbeddedDocuments("Item", [itemData]);

        const speakerSource = (typeof sourceActor !== "undefined") ? sourceActor : actor;
        
        let infoText = dict.chatInfo
            .replace("{name}", actor.name)
            .replace("{qs}", qs)
            .replace("{item}", elData.label)
            .replace("{desc}", elData.flavor);

        ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: speakerSource }),
            flavor: dict.dialogTitle, 
            content: infoText
        });
      }
    },
    cancel: {
      icon: '<i class="fas fa-times"></i>',
      label: dict.btnCancel,
      callback: () => { }
    }
  },
  default: "manifest"
}).render(true);
