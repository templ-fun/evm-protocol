// @ts-check
import { useState, useEffect } from 'react';
import { getInboxIdForIdentifier } from '@xmtp/browser-sdk';

function XMTPDebug() {
  const [debugInfo, setDebugInfo] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDebugInfo = async () => {
      try {
        // Get wallet info from global state (assuming it's available)
        const info = {
          walletAddress: window.walletAddress || 'Not available',
          xmtpClient: window.xmtpClient ? 'Available' : 'Not available',
          activeInboxId: window.activeInboxId || 'Not available',
          installationsCount: window.xmtpInstallations?.length || 'Unknown',
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString(),
          xmtpEnv: import.meta.env.VITE_XMTP_ENV || 'not set'
        };

        // Try to get user's inbox ID
        if (window.walletAddress) {
          try {
            const identifier = {
              identifier: window.walletAddress,
              identifierKind: 0 // 0 = Ethereum
            };
            const inboxId = await getInboxIdForIdentifier(identifier);
            info.userInboxId = inboxId || 'Not found';
            info.inboxIdTimestamp = new Date().toISOString();
          } catch (err) {
            info.userInboxIdError = err.message;
            info.inboxIdTimestamp = new Date().toISOString();
          }
        }

        setDebugInfo(info);
      } catch (err) {
        setDebugInfo({
          error: err.message,
          timestamp: new Date().toISOString()
        });
      } finally {
        setLoading(false);
      }
    };

    loadDebugInfo();
  }, []);

  if (loading) {
    return (
      <div className="space-y-3 p-4">
        <h2 className="text-xl font-semibold">XMTP Debug Info</h2>
        <p>Loading XMTP debug information...</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      <h2 className="text-xl font-semibold">XMTP Debug Information</h2>
      <p className="text-sm text-black/60">This page helps debug XMTP client issues. Use this information to troubleshoot priest addition problems.</p>

      <div className="border border-black/20 rounded p-3 space-y-2">
        <h3 className="text-lg font-medium mb-2">Basic Info</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <div><strong>Timestamp:</strong> {debugInfo.timestamp}</div>
          <div><strong>XMTP Environment:</strong> {debugInfo.xmtpEnv}</div>
        </div>
      </div>

      <div className="border border-black/20 rounded p-3 space-y-2">
        <h3 className="text-lg font-medium mb-2">Wallet & Connection</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <div><strong>Wallet Address:</strong> <code className="text-xs">{debugInfo.walletAddress}</code></div>
          <div><strong>XMTP Client:</strong> {debugInfo.xmtpClient}</div>
          <div><strong>Active Inbox ID:</strong> <code className="text-xs">{debugInfo.activeInboxId}</code></div>
          <div><strong>Installation Count:</strong> {debugInfo.installationsCount}</div>
        </div>
      </div>

      {debugInfo.userInboxId && (
        <div className="border border-black/20 rounded p-3 space-y-2">
          <h3 className="text-lg font-medium mb-2">User Inbox Resolution</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <div><strong>Your Inbox ID:</strong> <code className="text-xs">{debugInfo.userInboxId}</code></div>
            <div><strong>Query Time:</strong> {debugInfo.inboxIdTimestamp}</div>
          </div>
          <div className="mt-2 text-xs">
            <p>This is your XMTP inbox ID that should be used when you're listed as a priest in a templ.</p>
            {debugInfo.userInboxId !== 'Not found' ? (
              <p className="text-green-600">✅ Your wallet address can be resolved to an XMTP inbox ID!</p>
            ) : (
              <p className="text-red-600">❌ Your wallet address cannot be resolved to an XMTP inbox ID. You may need to initialize XMTP first.</p>
            )}
          </div>
        </div>
      )}

      {debugInfo.userInboxIdError && (
        <div className="border border-red-200 rounded p-3 space-y-2">
          <h3 className="text-lg font-medium mb-2">Inbox ID Resolution Error</h3>
          <div className="text-sm">
            <strong>Error:</strong> {debugInfo.userInboxIdError}
          </div>
        </div>
      )}

      {debugInfo.error && (
        <div className="border border-red-200 rounded p-3 space-y-2">
          <h3 className="text-lg font-medium mb-2">General Error</h3>
          <div className="text-sm">
            <strong>Error:</strong> {debugInfo.error}
          </div>
        </div>
      )}

      <div className="border border-black/20 rounded p-3 space-y-2">
        <h3 className="text-lg font-medium mb-2">User Agent</h3>
        <div className="text-xs font-mono break-all">{debugInfo.userAgent}</div>
      </div>

      <div className="space-y-2">
        <h3 className="text-lg font-medium">Next Steps</h3>
        <div className="text-sm text-black/70 space-y-1">
          <p>• If your <strong>User Inbox ID</strong> shows "Not found", you need to initialize XMTP with your wallet first</p>
          <p>• Compare your <strong>Active Inbox ID</strong> with <strong>Your Inbox ID</strong> - they should match when using this wallet</p>
          <p>• Make sure your XMTP environment matches the backend (backend is using: <code>local</code>)</p>
          <p>• Priest address needs to be resolved to the same inbox ID as shown here for automatic addition to work</p>
        </div>
      </div>
    </div>
  );
}

export default XMTPDebug;