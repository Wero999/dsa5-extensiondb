// transform spell source data object

let origEffect = source.effects.find(x => x.name == "Aeolito")

if(!origEffect) return

origEffect = foundry.utils.duplicate(origEffect)
source.effects = source.effects.filter(x => x.name != "Aeolito")

const lang = game.i18n.lang == "de" ? "de" : "en"
const dict = {
    de: {
        msg: "wurde von dem Windstoß betäubt"
    },
    en: {
        msg: "was stunned by the blast of wind"
    }
}[lang]


const setMacroCommand = (entry, command) => {
  entry.system ??= {};
  entry.system.macroArgs ??= {};
  entry.system.advancedFunction = 2;
  entry.system.macroArgs.macro = command;
};
setMacroCommand(origEffect, `msg += \` \${actor.name} ${dict.msg}.\`;\nawait actor.addCondition('stunned', 1, false)`)
source.effects.push(origEffect)
