// transform spell source data object

const afterEffectScript = `
{
    const effectName = "Nachwirkung";
    const existing = actor.effects.find(e => e.name === effectName);

    // Nur erstellen, wenn noch nicht vorhanden
    if (!existing) {
        // Fallback für QS, falls Makro manuell getestet wird
        const safeQs = (typeof qs !== "undefined") ? qs : 1;
        
        // Schadensformel: 1d3 + (QS / 2 abgerundet)
        const dmgVal = "1d3 + " + Math.floor(safeQs / 2);

        // Das Skript, das beim Entfernen ausgeführt wird.
        // Wir nutzen .evaluate() ohne {async: true}, da dies in Skript-Strings sicherer ist, 
        // oder wir verlassen uns auf den Standard.
        const removeScript = "const damageRoll = await new Roll('" + dmgVal + "').evaluate(); " +
                             "await actor.applyDamage(damageRoll.total); " +
                             "ChatMessage.create({speaker: ChatMessage.getSpeaker({ actor: actor }), content: actor.name + ' erleidet ' + damageRoll.total + ' Schaden durch Nachwirkung.'});";

        const effectData = {
            name: effectName,
            img: "icons/svg/daze.svg", 
            duration: {
                rounds: 1, // 1 KR entspricht 5 Sekunden - das ist stabiler für den Combat Tracker
                seconds: null
            },
            flags: {
                dsa5: {
                    description: effectName,
                    onRemove: removeScript
                }
            }
        };
        
        await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
    }
}
`;

let macroEffect = source.effects.find(x => x.flags?.dsa5?.args3);

if (macroEffect) {
    macroEffect = foundry.utils.duplicate(macroEffect);
    source.effects = source.effects.filter(x => x._id != macroEffect._id);
    
    macroEffect.flags.dsa5.args3 = `${afterEffectScript}\n${macroEffect.flags.dsa5.args3}`;
    
    source.effects.push(macroEffect);
} else {
    const newEffect = {
        _id: foundry.utils.randomID(),
        name: "Hexengalle (Nachwirkung)",
        img: "icons/svg/daze.svg",
        changes: [],
        transfer: false,
        flags: { dsa5: { advancedFunction: 2, args3: afterEffectScript } }
    };
    source.effects.push(newEffect);
}
