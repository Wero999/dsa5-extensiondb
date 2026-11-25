import { DSA5GodsMenuConfig } from './config.js';
import { FateRolls } from './dsa5-api.js';

const { renderTemplate } = foundry.applications.handlebars;

const MASTER_SCHIP_SPENT_QUERY = `${DSA5GodsMenuConfig.MODULE_ID}.notifyHeroSchipSpent`;

const evaluatedRollOutcomes = new Map();
let adjustmentQueue = Promise.resolve();

function queueMasterSchipAdjustment(delta, reason) {
    if (!delta || !game.users.activeGM?.isSelf) return;

    adjustmentQueue = adjustmentQueue.then(async () => {
        const { current, max } = DSA5GodsMenuConfig.getSchipSetting('masterschips');
        if (max <= 0) return;

        const next = Math.clamp(current + delta, 0, max);
        const applied = next - current;
        if (applied === 0) return;

        await DSA5GodsMenuConfig.setSchipSetting('masterschips', next, max);

        const content = await renderTemplate(DSA5GodsMenuConfig.templatePath('fate/master-schip-whisper.hbs'), {
            isGain: applied > 0,
            deltaLabel: applied > 0 ? `+${applied}` : String(applied),
            reason,
            current: next,
            max,
            tooltip: _loc('GodsMenu.FateTab.MasterPointsRemaining'),
            schips: DSA5GodsMenuConfig.buildMasterSchipDots(max, next, { background: true }),
        });

        await ChatMessage.create({
            content,
            whisper: ChatMessage.getWhisperRecipients('GM').map((u) => u.id),
            speaker: { alias: _loc('Gamemaster') },
        });
    }).catch((err) => {
        console.error(`${DSA5GodsMenuConfig.MODULE_ID} | Master Schip automation error`, err);
    });
}

function handleHeroSchipSpent({ actorId, pool, amount }, { user = game.user } = {}) {
    if (!user || pool === 'master') return { ok: false };

    const actor = game.actors.get(actorId);
    if (!actor?.hasPlayerOwner) return { ok: false };
    if (!user.isGM && !actor.testUserPermission(user, 'OWNER')) return { ok: false };

    const spent = Math.clamp(Math.trunc(Number(amount) || 0), 0, 5);
    if (spent <= 0) return { ok: false };

    const reason = pool === 'group'
        ? _loc(spent === 1 ? 'GodsMenu.MasterAuto.GroupSpentSchip' : 'GodsMenu.MasterAuto.GroupSpentSchips', { count: spent })
        : _loc(spent === 1 ? 'GodsMenu.MasterAuto.HeroSpentSchip' : 'GodsMenu.MasterAuto.HeroSpentSchips', { name: actor.name, count: spent });

    queueMasterSchipAdjustment(spent, reason);
    return { ok: true };
}

export async function notifyHeroSchipSpent({ actor, pool, amount = 1 }) {
    if (!actor?.hasPlayerOwner || pool === 'master' || amount <= 0) return;

    const payload = { actorId: actor.id, pool, amount };
    if (game.users.activeGM?.isSelf) {
        handleHeroSchipSpent(payload);
        return;
    }

    const activeGM = game.users.activeGM;
    if (!activeGM) return;

    try {
        await activeGM.query(MASTER_SCHIP_SPENT_QUERY, payload);
    } catch (err) {
        console.error(`${DSA5GodsMenuConfig.MODULE_ID} | Master Schip query error`, err);
    }
}

function evaluateRollOutcome(message) {
    const data = message?.flags?.data;
    const preData = data?.preData;
    const postData = data?.postData;
    if (!preData || !postData) return null;

    const actor = ChatMessage.getSpeakerActor(message.speaker);
    if (!actor?.hasPlayerOwner) return null;

    const type = preData.source?.type;
    if ((postData.rollType || type) === 'regenerate') return null;

    const successLevel = Number(postData.successLevel) || 0;

    if (DSA5GodsMenuConfig.isCombatRoll(preData)) {
        if (successLevel >= 3) return { delta: 1, reason: _loc('GodsMenu.MasterAuto.CombatCrit', { name: actor.name }) };
        if (successLevel <= -3) return { delta: -1, reason: _loc('GodsMenu.MasterAuto.CombatFumble', { name: actor.name }) };
        return { delta: 0, reason: '' };
    }

    if (FateRolls.MULTI_DIE_ROLL_TYPES.includes(type)) {
        const rollName = preData.source?.name || _loc('Skill');
        if (successLevel >= 2) return { delta: 1, reason: _loc('GodsMenu.MasterAuto.SkillCrit', { name: actor.name, roll: rollName }) };
        if (successLevel <= -2) return { delta: -1, reason: _loc('GodsMenu.MasterAuto.SkillFumble', { name: actor.name, roll: rollName }) };
    }

    return { delta: 0, reason: '' };
}

function handleRollMessage(message, isUpdate = false) {
    if (!game.users.activeGM?.isSelf) return;

    const outcome = evaluateRollOutcome(message);
    if (!outcome) return;

    const prevDelta = evaluatedRollOutcomes.get(message.id) ?? 0;
    evaluatedRollOutcomes.set(message.id, outcome.delta);

    if (outcome.delta === 0) return;
    if (isUpdate && outcome.delta === prevDelta) return;

    queueMasterSchipAdjustment(outcome.delta, outcome.reason);
}

Hooks.once('init', () => {
    CONFIG.queries[MASTER_SCHIP_SPENT_QUERY] = handleHeroSchipSpent;
});

Hooks.on('createChatMessage', (message) => handleRollMessage(message, false));

Hooks.on('updateChatMessage', (message, changes) => {
    if (!foundry.utils.hasProperty(changes, 'flags.data.postData')) return;
    handleRollMessage(message, true);
});

Hooks.on('deleteChatMessage', (message) => evaluatedRollOutcomes.delete(message.id));

Hooks.on('dsa5.fatePointSpent', (payload) => notifyHeroSchipSpent(payload));
