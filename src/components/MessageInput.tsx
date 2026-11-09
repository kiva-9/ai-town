import { toast } from 'react-toastify';
import { useI18n, errorMessage, characterName } from '../i18n';
import clsx from 'clsx';
import { useMutation, useQuery } from 'convex/react';
import { KeyboardEvent, useRef } from 'react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { useSendInput } from '../hooks/sendInput';
import { Player } from '../../convex/aiTown/player';
import { Conversation } from '../../convex/aiTown/conversation';

export function MessageInput({
  worldId,
  engineId,
  humanPlayer,
  conversation,
}: {
  worldId: Id<'worlds'>;
  engineId: Id<'engines'>;
  humanPlayer: Player;
  conversation: Conversation;
}) {
  const { t } = useI18n();
  const descriptions = useQuery(api.world.gameDescriptions, { worldId });
  const humanName = descriptions?.playerDescriptions.find(
    (p) => p.playerId === humanPlayer.id,
  )?.name;
  const inputRef = useRef<HTMLParagraphElement>(null);
  const inflightUuid = useRef<string | undefined>();
  const writeMessage = useMutation(api.messages.writeMessage);
  const startTyping = useSendInput(engineId, 'startTyping');
  const currentlyTyping = conversation.isTyping;

  const onKeyDown = async (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter' && e.shiftKey) return;

    // Set the typing indicator if we're not submitting.
    if (e.key !== 'Enter') {
      console.log(inflightUuid.current);
      if (currentlyTyping || inflightUuid.current !== undefined) {
        return;
      }
      inflightUuid.current = crypto.randomUUID();
      try {
        // Don't show a toast on error.
        await startTyping({
          playerId: humanPlayer.id,
          conversationId: conversation.id,
          messageUuid: inflightUuid.current,
        });
      } finally {
        inflightUuid.current = undefined;
      }
      return;
    }

    // Send the current message.
    e.preventDefault();
    if (!inputRef.current) {
      return;
    }
    const text = inputRef.current.innerText;
    if (!text) {
      return;
    }
    let messageUuid = inflightUuid.current;
    if (currentlyTyping && currentlyTyping.playerId === humanPlayer.id) {
      messageUuid = currentlyTyping.messageUuid;
    }
    messageUuid = messageUuid || crypto.randomUUID();
    try {
      await writeMessage({
        worldId,
        playerId: humanPlayer.id,
        conversationId: conversation.id,
        text,
        messageUuid,
      });
      inputRef.current.innerText = '';
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  return (
    <div className="leading-tight mb-6">
      <div className="flex gap-4">
        <span className="uppercase flex-grow">{characterName(humanName)}</span>
      </div>
      <p className="text-xs mb-1">{t('Type here')}</p>
      <div className={clsx('bubble', 'bubble-mine')}>
        <p
          className="bg-white -mx-3 -my-1"
          ref={inputRef}
          role="textbox"
          aria-label={t('Type here')}
          aria-multiline="true"
          contentEditable
          style={{ outline: 'none' }}
          tabIndex={0}
          placeholder={t('Type here')}
          onKeyDown={(e) => void onKeyDown(e)}
        />
      </div>
    </div>
  );
}
