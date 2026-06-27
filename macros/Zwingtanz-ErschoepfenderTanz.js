source.effects.push({
  name: source.name,
  img: "icons/svg/aura.svg",
  duration: {},
  system: {
    visibility: { hideOnToken: true },
    description: effect.system.description.value,
    macroArgs: {
      onRemove: `await actor.addCondition("stunned", 1, false)`,
    },
    changes: [],
  },
});
