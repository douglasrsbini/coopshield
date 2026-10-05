import { useState, useEffect } from 'react';
import Joyride, { CallBackProps, STATUS, Step } from 'react-joyride';

export default function OnboardingTour() {
  const [run, setRun] = useState(false);

  useEffect(() => {
    // Verifica se o usuário já fez o tour antes
    const tourCompleted = localStorage.getItem('kopher_tour_completed');
    if (tourCompleted !== 'true') {
      // Dá um pequeno delay para a interface carregar antes de iniciar o tour
      const timer = setTimeout(() => setRun(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  // Definição dos passos do nosso tour
  const steps: Step[] = [
    {
      target: 'body', // Alvo genérico para o meio da tela
      placement: 'center',
      title: 'Bem-vindo ao Painel Central',
      content: 'Este é o Kopher Shield. Vamos fazer um tour rápido de 1 minuto para lhe apresentar a sua nova central de segurança cibernética.',
      disableBeacon: true, // Começa direto, sem precisar clicar no pontinho
    },
    {
      target: '#tour-sidebar',
      title: 'Navegação Estratégica',
      content: 'Aqui no menu lateral, você transita entre o monitoramento, a configuração de novas rotinas de backup e a gestão dos seus cofres na nuvem.',
      placement: 'right',
    },
    {
      target: '#tour-stats',
      title: 'Telemetria em Tempo Real',
      content: 'Estes cards mostram a saúde do seu ambiente. Acompanhe blocos protegidos e o último sucesso de execução rapidamente.',
      placement: 'bottom',
    },
    {
      target: '#export-dashboard',
      title: 'Auditoria e Relatórios',
      content: 'Aqui você visualiza o extrato de atividades e a auditoria linha por linha. Ideal para prestação de contas (Compliance).',
      placement: 'top',
    },
    {
      target: '#tour-export-btn',
      title: 'Exportação Executiva',
      content: 'Precisa apresentar os dados para a diretoria? Exporte esta visão em PDF ou imagem de alta resolução com um único clique.',
      placement: 'left',
    }
  ];

  const handleJoyrideCallback = (data: CallBackProps) => {
    const { status } = data;
    const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED];

    // Se o usuário terminar ou pular o tour, nós marcamos no disco para não mostrar mais
    if (finishedStatuses.includes(status)) {
      localStorage.setItem('kopher_tour_completed', 'true');
      setRun(false);
    }
  };

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous={true} // Permite botão "Próximo"
      showSkipButton={true} // Permite pular
      showProgress={true} // Mostra 1/5, 2/5...
      callback={handleJoyrideCallback}
      styles={{
        options: {
          primaryColor: '#10b981', // A cor Primary (Esmeralda/Verde) da BINAVER
          textColor: '#f8fafc',
          backgroundColor: '#0f172a', // Fundo escuro (slate-900)
          arrowColor: '#0f172a',
          overlayColor: 'rgba(0, 0, 0, 0.75)',
          zIndex: 10000,
        },
        tooltipContainer: {
          textAlign: 'left',
        },
        buttonNext: {
          backgroundColor: '#10b981',
          borderRadius: '8px',
          fontWeight: 'bold',
        },
        buttonBack: {
          color: '#94a3b8',
          marginRight: '10px',
        },
        buttonSkip: {
          color: '#94a3b8',
          fontWeight: 'bold',
        }
      }}
      locale={{
        back: 'Anterior',
        close: 'Fechar',
        last: 'Finalizar',
        next: 'Próximo',
        skip: 'Pular Tour',
      }}
    />
  );
}