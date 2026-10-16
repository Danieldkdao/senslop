"use client";

import { useRef, useState } from "react";
import { Plus, History, Pencil, Trash2 } from "lucide-react";
import { useConfirm } from "@/hooks/use-confirm";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandItem,
  CommandEmpty,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { AgentForm } from "./agent-form";
import type { ModelSelection } from "../../providers/model-schemas";
import {
  useConversation,
  useAgentHistory,
  type useAgentState,
} from "../hooks/use-agent-state";
import { useAgentChat } from "../hooks/use-agent-chat";
import { useDefaultChatModel } from "../hooks/use-default-chat-model";
import { conversationSchema, type ConversationSchema } from "../schemas";
import { ChatMessage } from "./chat-message";
import {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
} from "@/components/ui/message-scroller";
import { HistoryTitleForm } from "./history-title-form";

type AgentChatProps = {
  snapshotId: string;
  agents: ReturnType<typeof useAgentState>;
};

export const AgentChat = ({ snapshotId, agents }: AgentChatProps) => {
  const [composerRevision, setComposerRevision] = useState(0);
  const [id, setId] = useState<string | null>(null);
  const [model, setModel] = useState<ModelSelection | null>(null);
  const [history, setHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [historyRename, setHistoryRename] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const savedHistory = useAgentHistory(
    snapshotId,
    "conversations",
    history,
    historySearch,
  );
  const deleteLock = useRef(false);
  const [deleting, setDeleting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const { confirm, ConfirmationDialog } = useConfirm(
    "Delete this conversation?",
    "This permanently removes the conversation and all its messages from this snapshot.",
  );
  const [pendingUser, setPendingUser] = useState("");
  const { conversation, refresh } = useConversation(id);
  const chat = useAgentChat(conversation.data ?? undefined, refresh);
  const defaultModel = useDefaultChatModel();
  const selectedModel = model ?? conversation.data?.model ?? defaultModel;
  const create = async (preserveDraft = false) => {
    const created = conversationSchema.parse(
      await agents.act({ action: "create", snapshotId }),
    );
    setId(created.id);
    setRenaming(false);
    if (!preserveDraft) {
      setModel(null);
      setPendingUser("");
      setComposerRevision((value) => value + 1);
      chat.reset();
    }
    return created.id;
  };
  const send = async (body: string) => {
    if (!selectedModel) throw new Error("Choose a chat model first.");
    setModel(selectedModel);
    setPendingUser(body);
    const conversationId = id ?? (await create(true));
    await chat.send(conversationId, selectedModel, body);
    setPendingUser("");
  };
  const deleteConversation = async (conversationId: string) => {
    if (chat.busy || deleteLock.current) return;
    deleteLock.current = true;
    setDeleting(true);
    try {
      if (!(await confirm())) return;
      await agents.act({ action: "delete", id: conversationId });
      if (conversationId === id) {
        setPendingUser("");
        setComposerRevision((value) => value + 1);
        setRenaming(false);
        chat.reset();
        setId(null);
        setModel(null);
      }
    } catch {
      // The action reports failures through the shared toast system.
    } finally {
      deleteLock.current = false;
      setDeleting(false);
    }
  };
  return (
    <div className="@container flex h-full min-h-0 min-w-0 flex-col">
      {ConfirmationDialog}
      <header className="flex flex-col gap-3 border-b p-4">
        <div className="flex items-center gap-1">
          <h3 className="min-w-0 flex-1 truncate font-medium">
            {conversation.data?.title ?? "Discuss your changes"}
          </h3>
          <Button
            variant="ghost"
            size="icon"
            aria-label="New conversation"
            disabled={chat.busy}
            onClick={() => void create(false).catch(() => {})}
          >
            <Plus className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Conversation history"
            disabled={chat.busy}
            onClick={() => setHistory(true)}
          >
            <History className="size-4" />
          </Button>
          {id && (
            <>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Rename conversation"
                onClick={() => setRenaming(!renaming)}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete conversation"
                disabled={chat.busy || deleting}
                onClick={() => void deleteConversation(id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </>
          )}
        </div>
        {renaming && conversation.data && (
          <HistoryTitleForm
            title={conversation.data.title}
            onCancel={() => setRenaming(false)}
            onSave={async (title) => {
              await agents.act({ action: "rename", id: id!, title });
              setRenaming(false);
            }}
          />
        )}
      </header>
      <div className="min-h-0 flex-1">
        <MessageScrollerProvider
          key={id ?? "new"}
          autoScroll
          defaultScrollPosition="last-anchor"
          scrollPreviousItemPeek={32}
        >
          <MessageScroller>
            <MessageScrollerViewport
              className="scroll-fade"
              aria-label="Conversation"
            >
              <MessageScrollerContent className="gap-6 p-4">
                {!chat.messages.length && !pendingUser && (
                  <MessageScrollerItem messageId="empty">
                    <p className="text-base text-muted-foreground">
                      Ask about this snapshot. The agent can inspect frozen
                      source, symbols, dependencies, and related tests.
                    </p>
                  </MessageScrollerItem>
                )}
                {chat.messages.map((message, index) => (
                  <MessageScrollerItem
                    key={message.id}
                    messageId={message.id}
                    scrollAnchor={message.role === "user"}
                  >
                    <ChatMessage
                      message={message}
                      busy={
                        chat.busy &&
                        index === chat.messages.length - 1 &&
                        message.role === "assistant"
                      }
                    />
                  </MessageScrollerItem>
                ))}
                {chat.busy && chat.messages.at(-1)?.role !== "assistant" && (
                  <MessageScrollerItem messageId="pending-response">
                    <p
                      role="status"
                      className="shimmer text-base text-muted-foreground motion-reduce:shimmer-none"
                    >
                      Thinking…
                    </p>
                  </MessageScrollerItem>
                )}
                {conversation.error && (
                  <MessageScrollerItem messageId="conversation-error">
                    <p role="alert" className="text-base text-destructive">
                      {conversation.error.message}
                      <Button
                        className="text-base"
                        onClick={() => void refresh()}
                      >
                        Retry loading
                      </Button>
                    </p>
                  </MessageScrollerItem>
                )}
                {chat.error && (
                  <MessageScrollerItem messageId="response-error">
                    <p role="alert" className="text-base text-destructive">
                      {chat.error.message}
                    </p>
                  </MessageScrollerItem>
                )}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>
      </div>
      <div className="flex flex-col gap-3 border-t p-4">
        <AgentForm
          key={composerRevision}
          initialContent={pendingUser}
          model={selectedModel}
          onModelChange={setModel}
          busy={chat.busy}
          retry={!!chat.error}
          onSend={send}
          onStop={chat.stop}
        />
      </div>
      <CommandDialog
        open={history}
        onOpenChange={(open) => {
          setHistory(open);
          if (!open) setHistoryRename(null);
        }}
        title="Conversations"
        description="Reopen a conversation from this snapshot."
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={historySearch}
            onValueChange={setHistorySearch}
            placeholder="Find a conversation…"
            className="text-base"
          />
          <CommandList>
            <CommandEmpty>No conversations yet.</CommandEmpty>
            {(
              savedHistory.data?.pages
                .flatMap((page) => page.items)
                .filter(
                  (item): item is Omit<ConversationSchema, "messages"> =>
                    !("kind" in item),
                ) ?? agents.state.data?.conversations
            )?.map((item) => (
              <CommandItem
                key={item.id}
                value={`${item.title} ${item.id}`}
                className="p-3 text-base bg-transparent! data-[selected=true]:bg-muted! [&>svg:last-child]:hidden"
                onSelect={() => {
                  chat.reset();
                  setPendingUser("");
                  setComposerRevision((value) => value + 1);
                  setRenaming(false);
                  setId(item.id);
                  setModel(null);
                  setHistory(false);
                }}
              >
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Rename conversation ${item.title}`}
                  disabled={chat.busy || deleting}
                  onKeyDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    setHistoryRename({ id: item.id, title: item.title });
                  }}
                >
                  <Pencil aria-hidden="true" className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete conversation ${item.title}`}
                  disabled={chat.busy || deleting}
                  onKeyDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    void deleteConversation(item.id);
                  }}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </Button>
              </CommandItem>
            ))}
          </CommandList>
          {savedHistory.error && (
            <p role="alert" className="p-3">
              {savedHistory.error.message}
              <Button
                className="text-base"
                onClick={() => void savedHistory.refetch()}
              >
                Retry
              </Button>
            </p>
          )}
          {savedHistory.hasNextPage && (
            <Button
              className="text-base"
              disabled={savedHistory.isFetchingNextPage}
              onClick={() => void savedHistory.fetchNextPage()}
            >
              Load more conversations
            </Button>
          )}
        </Command>
        <Dialog
          open={!!historyRename}
          onOpenChange={(open) => {
            if (!open) setHistoryRename(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rename conversation</DialogTitle>
              <DialogDescription>
                Choose a name to find this conversation in history.
              </DialogDescription>
            </DialogHeader>
            {historyRename && (
              <HistoryTitleForm
                key={historyRename.id}
                title={historyRename.title}
                onCancel={() => setHistoryRename(null)}
                onSave={async (title) => {
                  await agents.act({
                    action: "rename",
                    id: historyRename.id,
                    title,
                  });
                  setHistoryRename(null);
                }}
              />
            )}
          </DialogContent>
        </Dialog>
      </CommandDialog>
    </div>
  );
};
