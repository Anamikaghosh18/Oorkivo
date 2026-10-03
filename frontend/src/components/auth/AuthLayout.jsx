import styles from './AuthLayout.module.css';
import { ArrowUpRight, Check, Circle, LayoutDashboard, MoreHorizontal, Plus, UsersRound } from 'lucide-react';

export function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

function WorkspaceShowcase() {
  return (
    <div className={styles.workspaceShowcase} aria-label="Oorkivo workspace preview">
      <div className={styles.showcaseTopbar}>
        <span className={styles.showcaseWindowDots}><i /><i /><i /></span>
        <span>oorkivo.app</span>
        <ArrowUpRight size={14} aria-hidden="true" />
      </div>
      <div className={styles.showcaseBody}>
        <aside className={styles.showcaseSidebar}>
          <div className={styles.showcaseWorkspaceMark}>A</div>
          <span className={styles.showcaseNavActive}><LayoutDashboard size={15} /></span>
          <span className={styles.showcaseNav}><UsersRound size={15} /></span>
          <span className={styles.showcaseAdd}><Plus size={15} /></span>
        </aside>
        <div className={styles.showcaseMain}>
          <div className={styles.showcaseHeading}>
            <div>
              <span className={styles.showcaseEyebrow}>MONDAY, OCTOBER 5</span>
              <strong>Product team</strong>
            </div>
            <MoreHorizontal size={18} aria-hidden="true" />
          </div>
          <div className={styles.showcaseMetrics}>
            <div><span>In progress</span><strong>12 <small>tasks</small></strong></div>
            <div><span>Completed</span><strong>28 <small>this week</small></strong></div>
          </div>
          <div className={styles.showcaseSectionTitle}><span>Today’s focus</span><span>View all</span></div>
          <div className={styles.showcaseTask}>
            <span className={styles.showcaseCheck}><Check size={11} /></span>
            <span><strong>Finalize onboarding flow</strong><small>Website · Due today</small></span>
            <i className={styles.showcasePriority} />
          </div>
          <div className={styles.showcaseTask}>
            <span className={styles.showcaseCircle}><Circle size={13} /></span>
            <span><strong>Review sprint goals</strong><small>Product · In review</small></span>
            <i className={styles.showcaseReview} />
          </div>
          <div className={styles.showcaseFooter}>
            <div className={styles.showcaseAvatars}><i>J</i><i>M</i><i>A</i></div>
            <span>Everyone moving together</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AuthLayout({ children, title, subtitle, variant }) {
  const isOnboarding = variant === 'onboarding';
  const isAuth = variant === 'auth';
  return (
    <div className={`${styles.container} ${isOnboarding ? styles.onboardingContainer : ''} ${isAuth ? styles.authContainer : ''}`}>
      {/* ── Left Column: Visual / Illustration ── */}
      <div className={`${styles.visualCol} ${isOnboarding ? styles.onboardingVisual : ''} ${isAuth ? styles.authVisual : ''}`}>
        <div className={styles.visualContent}>
          <div className={styles.brand}>
            <div className={styles.logoMark}>
              <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
                <rect width="7" height="7" rx="1.5" fill="white" fillOpacity="0.9"/>
                <rect x="9" width="7" height="7" rx="1.5" fill="white" fillOpacity="0.55"/>
                <rect y="9" width="7" height="7" rx="1.5" fill="white" fillOpacity="0.55"/>
                <rect x="9" y="9" width="7" height="7" rx="1.5" fill="white" fillOpacity="0.3"/>
              </svg>
            </div>
            <span className={styles.brandName}>Oorkivo</span>
          </div>

          {isOnboarding ? (
            <>
              <div className={styles.onboardingStory}>
                <span>ONE SPACE. CLEAR MOMENTUM.</span>
                <h2>Bring your team’s work into focus.</h2>
                <p>Plan projects, share progress, and keep the next step clear for everyone.</p>
              </div>
              <div className={styles.illustrationWrap}><WorkspaceShowcase /></div>
              <div className={styles.onboardingFootnote}><span><Check size={13} /></span> Thoughtful work starts with a shared space.</div>
            </>
          ) : isAuth ? (
            <>
              <div className={styles.authStory}>
                <span>THE CALMER WAY TO GET THINGS DONE</span>
                <h2>Good work happens when everyone’s in sync.</h2>
                <p>Bring projects, people, and priorities together in one thoughtful workspace.</p>
              </div>
              <div className={styles.illustrationWrap}><WorkspaceShowcase /></div>
              <div className={styles.authFootnote}>
                <span className={styles.authAvatars}><i>J</i><i>M</i><i>A</i></span>
                <span>One clear view for the whole team</span>
                <span className={styles.authFootnoteDot} />
                <span>Built for focused work</span>
              </div>
            </>
          ) : (
            <>
              <div className={styles.illustrationWrap}>
                <svg viewBox="0 0 400 400" fill="none" className={styles.illustration}>
                  <circle cx="200" cy="200" r="180" fill="#253026" />
                  <rect x="120" y="140" width="160" height="180" rx="12" fill="#DED7C9" />
                  <rect x="140" y="100" width="160" height="180" rx="12" fill="#82907D" />
                  <rect x="80" y="200" width="140" height="100" rx="8" fill="#F7F4ED" />
                  <circle cx="120" cy="240" r="16" fill="#B79F8C" />
                  <rect x="150" y="235" width="40" height="10" rx="5" fill="#DED7C9" />
                  <rect x="170" y="140" width="100" height="8" rx="4" fill="#252923" fillOpacity="0.1" />
                  <rect x="170" y="160" width="70" height="8" rx="4" fill="#252923" fillOpacity="0.1" />
                  <path d="M260 220 L300 260 L280 280 Z" fill="#596957" />
                  <circle cx="280" cy="180" r="24" fill="#B79F8C" />
                </svg>
              </div>
              <div className={styles.quoteWrap}>
                <blockquote className={styles.quote}>
                  "Oorkivo has fundamentally transformed how our teams align, collaborate, and deliver premium work."
                </blockquote>
                <p className={styles.quoteAuthor}>— Senior Product Team</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Right Column: Form Area ── */}
      <div className={`${styles.formCol} ${isOnboarding ? styles.onboardingForm : ''} ${isAuth ? styles.authForm : ''}`}>
        <div className={styles.formContainer}>
          {/* Mobile brand (hidden on desktop) */}
          <div className={styles.mobileBrand}>
            <div className={styles.logoMarkMobile}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect width="7" height="7" rx="1.5" fill="white" fillOpacity="0.9"/>
                <rect x="9" width="7" height="7" rx="1.5" fill="white" fillOpacity="0.55"/>
                <rect y="9" width="7" height="7" rx="1.5" fill="white" fillOpacity="0.55"/>
                <rect x="9" y="9" width="7" height="7" rx="1.5" fill="white" fillOpacity="0.3"/>
              </svg>
            </div>
            <span>Oorkivo</span>
          </div>

          <h1 className={styles.title}>{title}</h1>
          <p className={styles.subtitle}>{subtitle}</p>

          {children}
        </div>
      </div>
    </div>
  );
}
