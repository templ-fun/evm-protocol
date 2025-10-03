import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Client } from '@xmtp/browser-sdk';
import templArtifact from '../contracts/TEMPL.json';
import { BACKEND_URL } from '../config.js';
import { waitForConversation } from '../../../shared/xmtp.js';
import { sanitizeLink } from '../../../shared/linkSanitizer.js';
import { verifyMembership, fetchMemberPoolStats, claimMemberPool } from '../services/membership.js';
import { proposeVote, voteOnProposal, executeProposal, watchProposals } from '../services/governance.js';
import { fetchTemplStats } from '../services/templs.js';
import { button, form, layout, surface, text } from '../ui/theme.js';

const XMTP_ENV = import.meta.env?.VITE_XMTP_ENV || globalThis?.process?.env?.XMTP_ENV || 'dev';

const PROPOSAL_ACTIONS = [
  { value: 'setJoinPaused', label: 'Pause / Resume Joins' },
  { value: 'setDictatorship', label: 'Toggle Dictatorship' },
  { value: 'changePriest', label: 'Change Priest' },
  { value: 'setMaxMembers', label: 'Set Max Members' },
  { value: 'withdrawTreasury', label: 'Withdraw Treasury' },
  { value: 'updateConfig', label: 'Update Config & Fee Split' },
  { value: 'setHomeLink', label: 'Update Home Link' },
  { value: 'setEntryFeeCurve', label: 'Update Entry Fee Curve' },
  { value: 'disbandTreasury', label: 'Disband Treasury' },
  { value: 'customCallData', label: 'Custom callData (advanced)' }
];

function shortAddress(value) {
  if (!value) return '';
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function formatTimestamp(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  try {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return date.toISOString();
  }
}

function parseAmountRaw(value) {
  if (value === undefined || value === null || value === '') return null;
  try {
    const asBig = BigInt(value);
    if (asBig < 0n) throw new Error('Amount must be positive');
    return asBig.toString();
  } catch {
    throw new Error('Enter amount in wei (numeric string)');
  }
}

function renderStat(label, primary, secondary) {
  if (!primary) return null;
  return (
    <div className="flex flex-col">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <span className={`${text.mono} text-sm text-slate-100`}>{primary}</span>
      {secondary ? <span className="text-xs text-slate-400">{secondary}</span> : null}
    </div>
  );
}

export function ChatPage({
  ethers,
  signer,
  walletAddress,
  onConnectWallet,
  templAddress,
  navigate,
  pushMessage,
  readProvider
}) {
  const walletAddressLower = walletAddress?.toLowerCase() || '';
  const templAddressLower = useMemo(() => (templAddress ? templAddress.toLowerCase() : ''), [templAddress]);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [xmtpClient, setXmtpClient] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [groupId, setGroupId] = useState('');
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [stats, setStats] = useState(null);
  const [proposalComposerOpen, setProposalComposerOpen] = useState(false);
  const [proposalAction, setProposalAction] = useState('setJoinPaused');
  const [proposalTitle, setProposalTitle] = useState('');
  const [proposalDescription, setProposalDescription] = useState('');
  const [proposalParams, setProposalParams] = useState({});
  const [proposals, setProposals] = useState(new Map());
  const [votedChoices, setVotedChoices] = useState(new Map());
  const [claimModalOpen, setClaimModalOpen] = useState(false);
  const [claimInfo, setClaimInfo] = useState(null);
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimError, setClaimError] = useState('');

  const messageIdsRef = useRef(new Set());
  const streamAbortRef = useRef(null);
  const messagesEndRef = useRef(null);

  const templStatsKey = `${templAddressLower}-${walletAddressLower}`;

  const appendMessage = useCallback((entry) => {
    setMessages((prev) => {
      if (messageIdsRef.current.has(entry.id)) return prev;
      messageIdsRef.current.add(entry.id);
      return [...prev, entry].sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
    });
  }, []);

  const ensureProposalRecord = useCallback((proposalId) => {
    setProposals((prev) => {
      const next = new Map(prev);
      const existing = next.get(proposalId) || {};
      next.set(proposalId, {
        id: proposalId,
        title: existing.title || '',
        description: existing.description || '',
        proposer: existing.proposer || '',
        yesVotes: existing.yesVotes ?? 0,
        noVotes: existing.noVotes ?? 0,
        endTime: existing.endTime ?? 0,
        executed: existing.executed ?? false,
        passed: existing.passed ?? false
      });
      return next;
    });
  }, []);

  const refreshProposalDetails = useCallback(async (proposalId) => {
    if (!ethers || !readProvider || !templAddressLower) return;
    try {
      const contract = new ethers.Contract(templAddressLower, templArtifact.abi, readProvider);
      const details = await contract.getProposal(proposalId);
      const [proposer, yesVotes, noVotes, endTime, executed, passed, title, description] = details;
      setProposals((prev) => {
        const next = new Map(prev);
        next.set(proposalId, {
          id: proposalId,
          proposer: proposer ? String(proposer).toLowerCase() : '',
          yesVotes: Number(yesVotes ?? 0),
          noVotes: Number(noVotes ?? 0),
          endTime: Number(endTime ?? 0),
          executed: Boolean(executed),
          passed: Boolean(passed),
          title: title || '',
          description: description || ''
        });
        return next;
      });
    } catch (err) {
      console.warn('[templ] Failed to refresh proposal details', proposalId, err);
    }
  }, [ethers, readProvider, templAddressLower]);

  const interpretMessage = useCallback((msg) => {
    const sender = msg.senderAddress ? String(msg.senderAddress).toLowerCase() : '';
    const sentAt = msg.sentAt instanceof Date ? msg.sentAt : new Date(msg.sentAt);
    let kind = 'text';
    let payload = msg.content;

    if (typeof msg.content === 'string') {
      try {
        const parsed = JSON.parse(msg.content);
        if (parsed && typeof parsed === 'object' && typeof parsed.type === 'string') {
          kind = parsed.type;
          payload = parsed;
        }
      } catch {
        kind = 'text';
      }
    } else if (msg.content && typeof msg.content === 'object' && msg.content.type) {
      kind = msg.content.type;
      payload = msg.content;
    }

    if (kind === 'proposal') {
      const proposalId = Number(payload.id ?? payload.proposalId ?? 0);
      ensureProposalRecord(proposalId);
      refreshProposalDetails(proposalId);
    }
    if (kind === 'proposal-meta') {
      const proposalId = Number(payload.id ?? payload.proposalId ?? 0);
      setProposals((prev) => {
        const next = new Map(prev);
        const existing = next.get(proposalId) || {};
        next.set(proposalId, {
          ...existing,
          id: proposalId,
          title: payload.title || existing.title || '',
          description: payload.description || existing.description || ''
        });
        return next;
      });
    }
    if (kind === 'vote') {
      const proposalId = Number(payload.id ?? payload.proposalId ?? 0);
      ensureProposalRecord(proposalId);
      refreshProposalDetails(proposalId);
      if (payload.voter && payload.voter.toLowerCase() === walletAddressLower) {
        setVotedChoices((prev) => {
          const next = new Map(prev);
          next.set(proposalId, Boolean(payload.support));
          return next;
        });
      }
    }

    appendMessage({
      id: msg.id,
      senderAddress: sender,
      sentAt,
      kind,
      payload
    });
  }, [appendMessage, ensureProposalRecord, refreshProposalDetails, walletAddressLower]);

  useEffect(() => {
    if (!signer || !walletAddress) {
      setXmtpClient(null);
      setConversation(null);
      setGroupId('');
      setMessages([]);
      messageIdsRef.current.clear();
      return;
    }
    let cancelled = false;
    setError('');
    setLoading(true);
    Client.create(signer, { env: XMTP_ENV })
      .then((client) => {
        if (cancelled) {
          try { client?.close?.(); } catch {}
          return;
        }
        setXmtpClient(client);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message || 'Failed to initialise XMTP client.');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
      try { xmtpClient?.close?.(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signer, walletAddress]);

  useEffect(() => {
    if (!xmtpClient || !templAddressLower || !signer) return;
    let cancelled = false;

    async function connectConversation() {
      setLoading(true);
      setError('');
      try {
        const membership = await verifyMembership({
          signer,
          templAddress: templAddressLower,
          walletAddress,
          backendUrl: BACKEND_URL,
          ethers,
          templArtifact,
          readProvider
        });
        if (cancelled) return;
        if (!membership.groupId) {
          throw new Error('Chat group is not ready yet. Try again shortly.');
        }
        setGroupId(membership.groupId);
        const convo = await waitForConversation({ xmtp: xmtpClient, groupId: membership.groupId, retries: 12, delayMs: 500 });
        if (!convo) {
          throw new Error('Unable to locate chat conversation. Please retry soon.');
        }
        if (cancelled) return;
        setConversation(convo);
        setStats((prev) => ({ ...prev, priest: membership.templ?.priest || '', templHomeLink: membership.templ?.templHomeLink || '' }));
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'Failed to join chat.');
          setLoading(false);
        }
      }
    }

    connectConversation();
    return () => {
      cancelled = true;
    };
  }, [xmtpClient, templAddressLower, signer, walletAddress, ethers, readProvider]);

  useEffect(() => {
    if (!conversation) return;
    let cancelled = false;
    messageIdsRef.current.clear();
    setMessages([]);

    async function loadHistory() {
      try {
        const history = await conversation.messages();
        if (cancelled) return;
        history.sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
        for (const msg of history) {
          interpretMessage(msg);
        }
      } catch (err) {
        console.warn('[templ] Failed to load chat history', err);
      }
    }

    async function streamMessages() {
      try {
        const stream = await conversation.streamMessages();
        streamAbortRef.current = stream;
        for await (const msg of stream) {
          if (cancelled) break;
          interpretMessage(msg);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('[templ] Message stream closed', err);
        }
      }
    }

    loadHistory();
    streamMessages();

    return () => {
      cancelled = true;
      try { streamAbortRef.current?.return?.(); } catch {}
      streamAbortRef.current = null;
    };
  }, [conversation, interpretMessage]);

  useEffect(() => {
    if (!ethers || !readProvider || !templAddressLower) return;
    let cancelled = false;
    async function loadSummary() {
      try {
        const statsResponse = await fetchTemplStats({ ethers, provider: readProvider, templAddress: templAddressLower });
        if (!cancelled) {
          setStats((prev) => ({ ...statsResponse, priest: statsResponse.priest || prev?.priest || '', templHomeLink: statsResponse.templHomeLink || prev?.templHomeLink || '' }));
        }
      } catch (err) {
        console.warn('[templ] Failed to load templ stats', err);
      }
    }
    loadSummary();
    return () => { cancelled = true; };
  }, [ethers, readProvider, templAddressLower, templStatsKey]);

  useEffect(() => {
    if (!ethers || !readProvider || !templAddressLower) return;
    const stop = watchProposals({
      ethers,
      provider: readProvider,
      templAddress: templAddressLower,
      templArtifact,
      onProposal: ({ id, title, description, proposer, endTime }) => {
        setProposals((prev) => {
          const next = new Map(prev);
          const existing = next.get(id) || {};
          next.set(id, {
            ...existing,
            id,
            title: title || existing.title || '',
            description: description || existing.description || '',
            proposer: proposer ? String(proposer).toLowerCase() : existing.proposer || '',
            endTime: endTime || existing.endTime || 0
          });
          return next;
        });
        refreshProposalDetails(id);
      },
      onVote: ({ id, voter, support }) => {
        if (voter && voter.toLowerCase() === walletAddressLower) {
          setVotedChoices((prev) => {
            const next = new Map(prev);
            next.set(id, Boolean(support));
            return next;
          });
        }
        refreshProposalDetails(id);
      }
    });
    return () => {
      try { stop?.(); } catch {}
    };
  }, [ethers, readProvider, templAddressLower, walletAddressLower, refreshProposalDetails]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  const handleSendMessage = async (event) => {
    event.preventDefault();
    if (!conversation) {
      pushMessage?.('Chat not ready yet.');
      return;
    }
    const trimmed = messageInput.trim();
    if (!trimmed) return;
    try {
      await conversation.send(trimmed);
      setMessageInput('');
    } catch (err) {
      pushMessage?.(`Failed to send message: ${err?.message || err}`);
    }
  };

  const handleVote = async (proposalId, support) => {
    if (!signer) {
      onConnectWallet?.();
      return;
    }
    try {
      await voteOnProposal({
        ethers,
        signer,
        templAddress: templAddressLower,
        templArtifact,
        proposalId,
        support
      });
      setVotedChoices((prev) => {
        const next = new Map(prev);
        next.set(proposalId, support);
        return next;
      });
      await refreshProposalDetails(proposalId);
      pushMessage?.(`Vote submitted for proposal #${proposalId}`);
    } catch (err) {
      pushMessage?.(`Vote failed: ${err?.message || err}`);
    }
  };

  const handleExecute = async (proposalId) => {
    if (!signer) {
      onConnectWallet?.();
      return;
    }
    try {
      await executeProposal({
        ethers,
        signer,
        templAddress: templAddressLower,
        templArtifact,
        proposalId
      });
      await refreshProposalDetails(proposalId);
      pushMessage?.(`Execution submitted for proposal #${proposalId}`);
    } catch (err) {
      pushMessage?.(`Execution failed: ${err?.message || err}`);
    }
  };

  const handlePropose = async (event) => {
    event.preventDefault();
    if (!signer) {
      onConnectWallet?.();
      return;
    }
    if (!proposalTitle.trim()) {
      pushMessage?.('Proposal title required.');
      return;
    }
    const params = { ...proposalParams };
    try {
      if (proposalAction === 'setJoinPaused') {
        params.paused = params.paused === undefined ? true : params.paused;
      } else if (proposalAction === 'setDictatorship') {
        params.enable = Boolean(params.enable);
      } else if (proposalAction === 'setMaxMembers') {
        params.newMaxMembers = BigInt(params.newMaxMembers ?? 0).toString();
      } else if (proposalAction === 'withdrawTreasury') {
        params.amount = parseAmountRaw(params.amount ?? '0');
      } else if (proposalAction === 'updateConfig') {
        if (params.newEntryFee) params.newEntryFee = parseAmountRaw(params.newEntryFee);
        if (params.newBurnPercent) params.newBurnPercent = Number(params.newBurnPercent);
        if (params.newTreasuryPercent) params.newTreasuryPercent = Number(params.newTreasuryPercent);
        if (params.newMemberPoolPercent) params.newMemberPoolPercent = Number(params.newMemberPoolPercent);
        params.updateFeeSplit = params.updateFeeSplit !== undefined ? Boolean(params.updateFeeSplit) : true;
      } else if (proposalAction === 'setEntryFeeCurve') {
        if (typeof params.curve === 'string') {
          params.curve = JSON.parse(params.curve);
        }
        if (!params.curve) {
          throw new Error('Curve configuration required (JSON)');
        }
        params.baseEntryFee = parseAmountRaw(params.baseEntryFee ?? '0');
      } else if (proposalAction === 'disbandTreasury') {
        if (params.token === undefined || params.token === null || params.token === '') {
          params.token = ethers.ZeroAddress;
        }
      } else if (proposalAction === 'customCallData') {
        if (!params.callData || typeof params.callData !== 'string') {
          throw new Error('Provide callData hex string');
        }
      }

      const response = await proposeVote({
        ethers,
        signer,
        templAddress: templAddressLower,
        templArtifact,
        action: proposalAction === 'customCallData' ? undefined : proposalAction,
        callData: proposalAction === 'customCallData' ? params.callData : undefined,
        params: proposalAction === 'customCallData' ? undefined : params,
        title: proposalTitle.trim(),
        description: proposalDescription.trim()
      });
      if (response?.proposalId !== undefined && conversation) {
        try {
          await conversation.send(JSON.stringify({
            type: 'proposal-meta',
            id: Number(response.proposalId),
            title: proposalTitle.trim(),
            description: proposalDescription.trim()
          }));
        } catch {}
        refreshProposalDetails(Number(response.proposalId));
      }
      setProposalDescription('');
      setProposalTitle('');
      setProposalParams({});
      setProposalComposerOpen(false);
      pushMessage?.('Proposal submitted');
    } catch (err) {
      pushMessage?.(`Proposal failed: ${err?.message || err}`);
    }
  };

  const openClaimModal = useCallback(async () => {
    if (!signer) {
      onConnectWallet?.();
      return;
    }
    setClaimModalOpen(true);
    setClaimLoading(true);
    setClaimError('');
    try {
      const info = await fetchMemberPoolStats({
        ethers,
        signer,
        templAddress: templAddressLower,
        templArtifact,
        memberAddress: walletAddressLower
      });
      setClaimInfo(info);
    } catch (err) {
      setClaimError(err?.message || 'Failed to load claimable rewards');
    } finally {
      setClaimLoading(false);
    }
  }, [signer, onConnectWallet, ethers, templAddressLower, walletAddressLower]);

  const handleClaimRewards = async () => {
    if (!signer) {
      onConnectWallet?.();
      return;
    }
    setClaimLoading(true);
    setClaimError('');
    try {
      await claimMemberPool({ ethers, signer, templAddress: templAddressLower, templArtifact });
      pushMessage?.('Rewards claimed');
      const info = await fetchMemberPoolStats({
        ethers,
        signer,
        templAddress: templAddressLower,
        templArtifact,
        memberAddress: walletAddressLower
      });
      setClaimInfo(info);
    } catch (err) {
      setClaimError(err?.message || 'Claim failed');
    } finally {
      setClaimLoading(false);
    }
  };

  const renderMessage = (message) => {
    if (message.kind === 'proposal' || message.kind === 'proposal-meta') {
      const proposalId = Number(message.payload?.id ?? message.payload?.proposalId ?? 0);
      const record = proposals.get(proposalId);
      const yesVotes = record?.yesVotes ?? 0;
      const noVotes = record?.noVotes ?? 0;
      const endTime = record?.endTime ? new Date(record.endTime * 1000) : null;
      const expired = endTime ? endTime.getTime() <= Date.now() : false;
      const executed = record?.executed;
      const voted = votedChoices.get(proposalId);
      return (
        <div key={message.id} className="mb-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-semibold text-slate-300">{shortAddress(message.senderAddress)}</span>
            <span>{formatTimestamp(message.sentAt)}</span>
          </div>
          <div className="mt-2 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-slate-100">#{proposalId} {record?.title || 'Proposal'}</h3>
              {endTime ? (
                <span className="text-xs text-slate-400">{expired ? 'Voting closed' : `Ends ${endTime.toLocaleString()}`}</span>
              ) : null}
            </div>
            {record?.description ? (
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-200">{record.description}</p>
            ) : null}
            <div className="mt-3 grid gap-2 text-xs text-slate-300 sm:grid-cols-2">
              <div className={`rounded-xl border px-3 py-2 ${voted === true ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-800 bg-slate-900/60'}`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-emerald-200">YES</span>
                  <span className={`${text.mono} text-sm text-emerald-100`}>{yesVotes}</span>
                </div>
              </div>
              <div className={`rounded-xl border px-3 py-2 ${voted === false ? 'border-rose-500 bg-rose-500/10' : 'border-slate-800 bg-slate-900/60'}`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-rose-200">NO</span>
                  <span className={`${text.mono} text-sm text-rose-100`}>{noVotes}</span>
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={button.primary}
                onClick={() => handleVote(proposalId, true)}
                disabled={executed || expired || voted === true}
              >
                Vote Yes
              </button>
              <button
                type="button"
                className={button.secondary}
                onClick={() => handleVote(proposalId, false)}
                disabled={executed || expired || voted === false}
              >
                Vote No
              </button>
              <button
                type="button"
                className={button.base}
                onClick={() => handleExecute(proposalId)}
                disabled={executed || !expired}
              >
                Execute
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-400">
              <span>Proposer: {record?.proposer ? shortAddress(record.proposer) : 'unknown'}</span>
              <span>Status: {executed ? (record?.passed ? 'Executed ✅' : 'Executed ❌') : expired ? 'Awaiting execution' : 'Voting open'}</span>
            </div>
          </div>
        </div>
      );
    }

    if (message.kind === 'vote') {
      return (
        <div key={message.id} className="mb-3 text-xs text-amber-300">
          <span className="font-semibold text-slate-200">{shortAddress(message.senderAddress)}</span>
          {' voted '}
          {message.payload?.support ? 'YES' : 'NO'} on proposal #{message.payload?.id}
        </div>
      );
    }

    if (message.kind === 'priest-changed') {
      return (
        <div key={message.id} className="mb-3 text-sm text-purple-300">
          Priest changed to {shortAddress(message.payload?.newPriest)}
        </div>
      );
    }

    if (message.kind === 'proposal-executed') {
      return (
        <div key={message.id} className="mb-3 text-sm text-emerald-300">
          Proposal #{message.payload?.id} executed ({message.payload?.success ? 'success' : 'failed'})
        </div>
      );
    }

    if (message.kind === 'member-joined') {
      return (
        <div key={message.id} className="mb-3 text-sm text-slate-300">
          {shortAddress(message.payload?.member)} joined the templ
        </div>
      );
    }

    return (
      <div key={message.id} className="mb-3">
        <div className="text-xs text-slate-500">
          <span className="font-semibold text-slate-300">{shortAddress(message.senderAddress)}</span>
          {' · '}
          {formatTimestamp(message.sentAt)}
        </div>
        <div className="whitespace-pre-wrap text-sm text-slate-100">{typeof message.payload === 'string' ? message.payload : message.payload?.toString?.() || ''}</div>
      </div>
    );
  };

  const renderProposalComposer = () => (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 p-4">
      <div className="w-full max-w-2xl rounded-3xl border border-slate-800 bg-slate-950 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-100">New Proposal</h2>
          <button type="button" className={button.link} onClick={() => setProposalComposerOpen(false)}>Close</button>
        </div>
        <form className="space-y-4" onSubmit={handlePropose}>
          <label className={form.label}>
            Action
            <select
              className={form.select}
              value={proposalAction}
              onChange={(e) => {
                setProposalAction(e.target.value);
                setProposalParams({});
              }}
            >
              {PROPOSAL_ACTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className={form.label}>
            Title
            <input
              className={form.input}
              value={proposalTitle}
              onChange={(e) => setProposalTitle(e.target.value)}
              placeholder="Short title"
              required
            />
          </label>
          <label className={form.label}>
            Description
            <textarea
              className={form.textarea}
              value={proposalDescription}
              onChange={(e) => setProposalDescription(e.target.value)}
              placeholder="Optional details"
            />
          </label>
          {(() => {
            switch (proposalAction) {
              case 'setJoinPaused':
                return (
                  <label className={form.label}>
                    Pause joins?
                    <select
                      className={form.select}
                      value={String(proposalParams.paused ?? true)}
                      onChange={(e) => setProposalParams((prev) => ({ ...prev, paused: e.target.value === 'true' }))}
                    >
                      <option value="true">Pause new joins</option>
                      <option value="false">Resume joins</option>
                    </select>
                  </label>
                );
              case 'setDictatorship':
                return (
                  <label className={form.label}>
                    Dictatorship mode
                    <select
                      className={form.select}
                      value={String(proposalParams.enable ?? true)}
                      onChange={(e) => setProposalParams((prev) => ({ ...prev, enable: e.target.value === 'true' }))}
                    >
                      <option value="true">Enable dictatorship</option>
                      <option value="false">Disable dictatorship</option>
                    </select>
                  </label>
                );
              case 'changePriest':
                return (
                  <label className={form.label}>
                    New priest address
                    <input
                      className={form.input}
                      value={proposalParams.newPriest || ''}
                      onChange={(e) => setProposalParams((prev) => ({ ...prev, newPriest: e.target.value }))}
                      placeholder="0x..."
                    />
                  </label>
                );
              case 'setMaxMembers':
                return (
                  <label className={form.label}>
                    Member limit (0 for unlimited)
                    <input
                      className={form.input}
                      type="number"
                      value={proposalParams.newMaxMembers || ''}
                      onChange={(e) => setProposalParams((prev) => ({ ...prev, newMaxMembers: e.target.value }))}
                    />
                  </label>
                );
              case 'withdrawTreasury':
                return (
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className={form.label}>
                      Token (leave blank for native)
                      <input
                        className={form.input}
                        value={proposalParams.token || ''}
                        onChange={(e) => setProposalParams((prev) => ({ ...prev, token: e.target.value }))}
                        placeholder="0x..."
                      />
                    </label>
                    <label className={form.label}>
                      Recipient
                      <input
                        className={form.input}
                        value={proposalParams.recipient || ''}
                        onChange={(e) => setProposalParams((prev) => ({ ...prev, recipient: e.target.value }))}
                        placeholder="0x..."
                      />
                    </label>
                    <label className={form.label}>
                      Amount (wei)
                      <input
                        className={form.input}
                        value={proposalParams.amount || ''}
                        onChange={(e) => setProposalParams((prev) => ({ ...prev, amount: e.target.value }))}
                        placeholder="1000000000000000000"
                      />
                    </label>
                    <label className={form.label}>
                      Reason
                      <textarea
                        className={form.textarea}
                        value={proposalParams.reason || ''}
                        onChange={(e) => setProposalParams((prev) => ({ ...prev, reason: e.target.value }))}
                        placeholder="Optional context"
                      />
                    </label>
                  </div>
                );
              case 'updateConfig':
                return (
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className={form.label}>
                      New entry fee (wei)
                      <input
                        className={form.input}
                        value={proposalParams.newEntryFee || ''}
                        onChange={(e) => setProposalParams((prev) => ({ ...prev, newEntryFee: e.target.value }))}
                      />
                    </label>
                    <label className={form.label}>
                      Burn percent (bps)
                      <input
                        className={form.input}
                        type="number"
                        value={proposalParams.newBurnPercent || ''}
                        onChange={(e) => setProposalParams((prev) => ({ ...prev, newBurnPercent: e.target.value }))}
                      />
                    </label>
                    <label className={form.label}>
                      Treasury percent (bps)
                      <input
                        className={form.input}
                        type="number"
                        value={proposalParams.newTreasuryPercent || ''}
                        onChange={(e) => setProposalParams((prev) => ({ ...prev, newTreasuryPercent: e.target.value }))}
                      />
                    </label>
                    <label className={form.label}>
                      Member pool percent (bps)
                      <input
                        className={form.input}
                        type="number"
                        value={proposalParams.newMemberPoolPercent || ''}
                        onChange={(e) => setProposalParams((prev) => ({ ...prev, newMemberPoolPercent: e.target.value }))}
                      />
                    </label>
                    <label className={form.checkboxRow}>
                      <input
                        type="checkbox"
                        checked={proposalParams.updateFeeSplit !== false}
                        onChange={(e) => setProposalParams((prev) => ({ ...prev, updateFeeSplit: e.target.checked }))}
                      />
                      Apply new fee split values
                    </label>
                  </div>
                );
              case 'setHomeLink':
                return (
                  <label className={form.label}>
                    New home link
                    <input
                      className={form.input}
                      value={proposalParams.newHomeLink || ''}
                      onChange={(e) => setProposalParams((prev) => ({ ...prev, newHomeLink: e.target.value }))}
                      placeholder="https://"
                    />
                  </label>
                );
              case 'setEntryFeeCurve':
                return (
                  <div className="grid gap-4">
                    <label className={form.label}>
                      Curve JSON
                      <textarea
                        className={form.textarea}
                        value={proposalParams.curve || ''}
                        onChange={(e) => setProposalParams((prev) => ({ ...prev, curve: e.target.value }))}
                        placeholder='{"primary":{"style":1,"rateBps":11000}}'
                      />
                    </label>
                    <label className={form.label}>
                      Base entry fee (wei)
                      <input
                        className={form.input}
                        value={proposalParams.baseEntryFee || ''}
                        onChange={(e) => setProposalParams((prev) => ({ ...prev, baseEntryFee: e.target.value }))}
                      />
                    </label>
                  </div>
                );
              case 'disbandTreasury':
                return (
                  <label className={form.label}>
                    Token address (leave blank for access token)
                    <input
                      className={form.input}
                      value={proposalParams.token || ''}
                      onChange={(e) => setProposalParams((prev) => ({ ...prev, token: e.target.value }))}
                    />
                  </label>
                );
              case 'customCallData':
                return (
                  <label className={form.label}>
                    callData (hex)
                    <textarea
                      className={form.textarea}
                      value={proposalParams.callData || ''}
                      onChange={(e) => setProposalParams((prev) => ({ ...prev, callData: e.target.value }))}
                      placeholder="0x..."
                    />
                  </label>
                );
              default:
                return null;
            }
          })()}
          <div className="flex justify-end gap-2">
            <button type="button" className={button.base} onClick={() => setProposalComposerOpen(false)}>Cancel</button>
            <button type="submit" className={button.primary}>Submit proposal</button>
          </div>
        </form>
      </div>
    </div>
  );

  const renderClaimModal = () => (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 p-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-950 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-100">Claim rewards</h2>
          <button type="button" className={button.link} onClick={() => setClaimModalOpen(false)}>Close</button>
        </div>
        {claimLoading ? (
          <p className={text.subtle}>Loading claimable rewards…</p>
        ) : claimError ? (
          <p className="text-sm text-rose-400">{claimError}</p>
        ) : claimInfo ? (
          <div className="space-y-2 text-sm text-slate-200">
            <div>
              <span className="text-slate-400">Member pool balance:</span>
              <div className={`${text.mono} text-sm`}>{claimInfo.poolBalance?.toString?.() || claimInfo.poolBalanceFormatted || claimInfo.poolBalanceRaw || '0'}</div>
            </div>
            <div>
              <span className="text-slate-400">Claimable:</span>
              <div className={`${text.mono} text-sm`}>{claimInfo.claimable?.toString?.() || claimInfo.claimableFormatted || claimInfo.claimableWei || '0'}</div>
            </div>
            <div>
              <span className="text-slate-400">Already claimed:</span>
              <div className={`${text.mono} text-sm`}>{claimInfo.memberClaimed?.toString?.() || claimInfo.memberClaimedFormatted || '0'}</div>
            </div>
          </div>
        ) : (
          <p className={text.subtle}>No reward data available.</p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className={button.base} onClick={() => setClaimModalOpen(false)}>Close</button>
          <button type="button" className={button.primary} onClick={handleClaimRewards} disabled={claimLoading}>Claim rewards</button>
        </div>
      </div>
    </div>
  );

  if (!templAddressLower) {
    return (
      <div className={layout.page}>
        <div className={surface.panel}>Invalid templ address.</div>
      </div>
    );
  }

  if (!walletAddress) {
    return (
      <div className={layout.page}>
        <div className={surface.panel}>
          <h2 className={text.sectionHeading}>Connect Wallet</h2>
          <p className="mt-2 text-sm text-slate-300">Connect your member wallet to enter the templ chat.</p>
          <button type="button" className={`${button.primary} mt-4`} onClick={onConnectWallet}>
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  const statsItems = [
    renderStat('Priest', stats?.priest ? shortAddress(stats.priest) : null),
    renderStat('XMTP group', groupId ? `${groupId.slice(0, 8)}…${groupId.slice(-4)}` : 'pending'),
    renderStat('Members', stats?.memberCount != null ? String(stats.memberCount) : null),
    renderStat('Treasury', stats?.treasuryBalanceFormatted, stats?.tokenSymbol),
    renderStat('Member pool', stats?.memberPoolBalanceFormatted, stats?.tokenSymbol)
  ].filter(Boolean);

  return (
    <div className={layout.page}>
      <div className="flex flex-col gap-6">
        <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className={text.pageTitle}>Templ Chat</h1>
              <p className="text-sm text-slate-300">{shortAddress(templAddressLower)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={button.base} onClick={() => navigate?.(`/templs/${templAddressLower}`)}>Overview</button>
            </div>
          </div>
          {statsItems.length ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {statsItems}
            </div>
          ) : null}
          {(() => {
            if (!stats?.templHomeLink) return null;
            const { href, text: safeText } = sanitizeLink(stats.templHomeLink);
            if (!safeText) return null;
            return (
              <div className="mt-3 text-xs text-slate-400">
                Home:{' '}
                {href ? (
                  <a className="text-primary underline" href={href} target="_blank" rel="noreferrer">{safeText}</a>
                ) : (
                  <span>{safeText}</span>
                )}
              </div>
            );
          })()}
        </div>

        {error && (
          <div className="rounded-3xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        <section className="rounded-3xl border border-slate-800 bg-slate-950/80">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-100">Conversation</h2>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={button.base} onClick={() => setProposalComposerOpen(true)}>
                New proposal
              </button>
              <button type="button" className={button.base} onClick={openClaimModal}>
                Claim rewards
              </button>
            </div>
          </div>
          <div className="max-h-[520px] overflow-y-auto px-6 py-4">
            {loading && !conversation ? (
              <p className={text.subtle}>Connecting to chat…</p>
            ) : messages.length === 0 ? (
              <p className={text.subtle}>No messages yet. Say hello!</p>
            ) : (
              messages.map((message) => renderMessage(message))
            )}
            <div ref={messagesEndRef} />
          </div>
          <form onSubmit={handleSendMessage} className="flex items-center gap-3 border-t border-slate-800 px-6 py-4">
            <input
              className="flex-1 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-500"
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              placeholder={conversation ? 'Message templ members…' : 'Waiting for chat…'}
              disabled={!conversation}
            />
            <button type="submit" className={button.primary} disabled={!conversation || !messageInput.trim()}>
              Send
            </button>
          </form>
        </section>
      </div>
      {proposalComposerOpen && renderProposalComposer()}
      {claimModalOpen && renderClaimModal()}
    </div>
  );
}

export default ChatPage;
