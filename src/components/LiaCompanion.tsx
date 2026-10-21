type Props = {
  variant?: 'home' | 'header' | 'welcome' | 'message'
  state?: 'calm' | 'attentive' | 'working'
}

export function LiaCompanion({ variant = 'message', state = 'calm' }: Props) {
  return <span className={`lia-companion lia-companion-${variant} is-${state}`} aria-hidden="true">
    <span className="lia-companion-aura"/>
    <img src="/lia/lia-companion-v02.png" alt="" draggable={false}/>
  </span>
}
