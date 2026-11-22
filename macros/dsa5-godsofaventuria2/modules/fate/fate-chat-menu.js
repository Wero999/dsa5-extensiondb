import { DSA5GodsMenuConfig } from './config.js';
import { UnifiedFateDSA5 } from './dsa5-api.js';
import { getRegenBlessingActors, getXeledonCandidateActors } from './fate-context.js';

function getMessageFromLi(li) {
    const el = li?.length ? li[0] : li;
    return el?.dataset?.messageId ? game.messages.get(el.dataset.messageId) : null;
}

function canOpenExternalXeledon(message) {
    if (game.user.isGM || !message?.flags?.data?.preData) return false;
    const speakerActor = ChatMessage.getSpeakerActor(message.speaker);
    if (speakerActor?.isOwner) return false;
    return getXeledonCandidateActors(message).length > 0;
}

Hooks.on('dsa5.fateContextOptions', (fateOptions) => {
    const useSchip = fateOptions.find((option) => option.label === 'CHATCONTEXT.UseSchip');
    if (!useSchip) return;
    const coreVisible = useSchip.visible;
    useSchip.visible = (li) => coreVisible(li) || hasGodsPools(li);
});

Hooks.on('getChatMessageContextOptions', (html, options) => {
    options.push({
        label: 'GodsMenu.FateTab.UseSchip',
        icon: '<i class="fas fa-dice"></i>',
        visible: (li) => {
            const message = getMessageFromLi(li);
            return getRegenBlessingActors(message).length > 0 || canOpenExternalXeledon(message);
        },
        onClick: (event, li) => {
            const message = getMessageFromLi(li);
            const registry = { AppClass: UnifiedFateDSA5 };
            Hooks.callAll('dsa5.getFateSpendApp', registry);

            if (getRegenBlessingActors(message).length > 0) {
                registry.AppClass.openForRollRequest?.(message);
            } else if (canOpenExternalXeledon(message)) {
                registry.AppClass.openForXeledon?.(message);
            }
        },
    });
});

function hasGodsPools(li) {
    const message = getMessageFromLi(li);
    if (!message?.flags?.data?.preData) return false;

    const actor = ChatMessage.getSpeakerActor(message.speaker);
    if (!actor || !(actor.isOwner || game.user.isGM)) return false;

    const specialPoints = foundry.utils.getProperty(actor, 'flags.dsa5.specialPoints');
    if (specialPoints && Object.values(specialPoints).some((p) => (p?.current || 0) > 0)) {
        return true;
    }

    const isRegen = (message.flags.data.postData?.rollType || message.flags.data.preData.source?.type) === 'regenerate';
    if (game.user.isGM && !(isRegen && message.flags.data.meisterRegenUsed)) {
        if (DSA5GodsMenuConfig.getSchipSetting('masterschips').current > 0) return true;
    }

    if (game.user.isGM && getXeledonCandidateActors(message).length > 0) {
        return true;
    }

    return false;
}
