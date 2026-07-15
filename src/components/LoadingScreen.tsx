import React from 'react';

interface LoadingScreenProps {
  visible: boolean;
  statusText?: string;
  showProgress?: boolean;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  visible,
  statusText = 'กำลังโหลด...',
  showProgress = true,
}) => {
  if (!visible) return null;

  return (
    <div
      className="loading-screen"
      style={{
        position: 'fixed',
        top: 0, left: 0,
        width: '100%', height: '100%',
        backgroundColor: 'var(--bg-secondary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        animation: 'loadingFadeIn 0.2s ease',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 400, padding: 20 }}>
        {/* CSS Animated Logo Petal Loader */}
        <div className="css-logo-loader">
          <div className="logo-petal outer top"></div>
          <div className="logo-petal inner top-right"></div>
          <div className="logo-petal outer right"></div>
          <div className="logo-petal inner bottom-right"></div>
          <div className="logo-petal outer bottom"></div>
          <div className="logo-petal inner bottom-left"></div>
          <div className="logo-petal outer left"></div>
          <div className="logo-petal inner top-left"></div>
        </div>

        <h2 className="loading-title">Lyncub PDF</h2>
        <p className="loading-subtitle">PDF Workbench</p>

        {showProgress && (
          <div className="progress-bar-container">
            <div className="progress-bar-fill"></div>
          </div>
        )}

        <span className="loading-status">{statusText}</span>
      </div>
    </div>
  );
};
