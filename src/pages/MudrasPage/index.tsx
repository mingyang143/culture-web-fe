import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AIChat from 'components/AIChat';
import FloatingChatButton from 'components/FloatingChatButton';
import { Flex, Typography, Button, Modal, message } from 'antd';
import { MessageOutlined, CameraOutlined } from '@ant-design/icons';
import { useStyleToken } from 'themeStyles';
import useIsMobile from 'utils/isMobile';
import { useAuth } from 'contexts/AuthContext';
import {
  createNewSession,
  getUserSessions,
} from 'utils/invokeBackend';

const { Text, Title } = Typography;

function MudrasPage() {
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>();
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  
  const { isAuthenticated } = useAuth();
  const styleToken = useStyleToken();
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  const headingStyle = isMobile ? styleToken.culture.cultureSectionHeadingTextStyleMobile : styleToken.culture.cultureSectionHeadingTextStyle;
  const contentStyle = isMobile ? styleToken.culture.cultureSectionContentTextStyleMobile : styleToken.culture.cultureSectionContentTextStyle;

  const modalRender = (modal: React.ReactNode) => (
    <div style={{ backgroundColor: 'transparent' }}>
      {modal}
    </div>
  );

  // Handle opening chat - use existing session if available, otherwise create new
  const handleOpenChat = async () => {
    setIsCreatingSession(true);
    try {
      // If user is not authenticated, open chat without session
      if (!isAuthenticated) {
        setCurrentSessionId(undefined);
        setIsChatModalOpen(true);
        message.info('Opened temporary chat session');
        return;
      }

      // For authenticated users, check if there are existing sessions
      const existingSessions = await getUserSessions();
      
      if (existingSessions && existingSessions.length > 0) {
        // Use the latest (first) session
        const latestSession = existingSessions[0];
        setCurrentSessionId(latestSession.id);
        setIsChatModalOpen(true);
        message.success('Opened latest chat session');
      } else {
        // No existing sessions, create a new one
        const newSession = await createNewSession();
        setCurrentSessionId(newSession.id);
        setIsChatModalOpen(true);
        message.success('New chat session created');
      }
    } catch (error) {
      console.error('Failed to handle chat session:', error);
      message.error('Failed to load session, opening chat without session');
      setIsChatModalOpen(true);
    } finally {
      setIsCreatingSession(false);
    }
  };

  // Handle session change from chat component
  const handleSessionChange = (sessionId: string) => {
    setCurrentSessionId(sessionId);
  };

  return (
    <Flex vertical align="center">
      <Title style={styleToken.pageHeadingTextStyle}>Learn Mudras & Cultural Knowledge</Title>

      <Flex vertical align="center" style={{ maxWidth: isMobile ? '90%' : '75%' }}>
        <section id="overview">
          <Title style={headingStyle}>
            What are Mudras?
          </Title>
          <Text style={contentStyle}>
            Mudras are symbolic hand gestures that are fundamental to Indian classical dance forms like Kathakali, Bharatanatyam, and Kootiyattam. Each mudra represents specific meanings, emotions, objects, and narratives. These intricate hand positions combined with body movements and facial expressions create a sophisticated language of storytelling and cultural expression.
          </Text>
          <Text style={{...contentStyle, marginTop: '1rem', display: 'block'}}>
            There are primarily two types of mudras:
          </Text>
          <ul style={{ ...contentStyle, marginLeft: '2rem', marginTop: '0.5rem' }}>
            <li><strong>Asamyuta Mudras:</strong> Hand gestures performed with a single hand</li>
            <li><strong>Samyuta Mudras:</strong> Hand gestures performed with both hands together</li>
          </ul>
        </section>

        <section id="learning" style={{ marginTop: '2rem' }}>
          <Title style={headingStyle}>
            Learn More with Our AI Assistant
          </Title>
          <Text style={contentStyle}>
            Our AI-powered Learning Assistant provides detailed information about various mudras, their meanings, cultural significance, and their use in different classical dance traditions. Ask questions about any of the following:
          </Text>
          <ul style={{ ...contentStyle, marginLeft: '2rem', marginTop: '0.5rem' }}>
            <li>Specific mudra names, meanings, and variations</li>
            <li>How mudras are used in storytelling and expression</li>
            <li>The history and cultural significance of mudras</li>
            <li>Mudras in different classical dance forms</li>
            <li>How to perform specific mudras</li>
          </ul>
          <Flex gap="large" wrap="wrap" style={{ margin: '1.5rem 0rem' }}>
            <Button 
              type="primary"
              icon={<CameraOutlined />}
              onClick={() => navigate('/learn/mudras/practice')}
              style={{ 
                backgroundColor: '#10B981',
                borderColor: '#10B981',
                height: '40px',
                fontSize: '16px'
              }}
            >
              Practice Mudras (3D AI Vision Coach)
            </Button>
            <Button 
              type="primary"
              icon={<MessageOutlined />}
              onClick={handleOpenChat}
              loading={isCreatingSession}
              style={{ 
                backgroundColor: '#c81f58',
                borderColor: '#c81f58',
                height: '40px',
                fontSize: '16px'
              }}
            >
              Start Learning with AI Assistant
            </Button>
          </Flex>
          <Text style={contentStyle}>
            The AI assistant uses our comprehensive knowledge base to provide accurate and detailed information about mudras, cultural traditions, and classical dance forms.
          </Text>
        </section>
      </Flex>

      {/* AI Chat Modal */}
      <Modal
        open={isChatModalOpen}
        onCancel={() => setIsChatModalOpen(false)}
        footer={null}
        width={isMobile ? '95%' : '90%'}
        style={{ maxWidth: '900px' }}
        styles={{ 
          body: { padding: 0, backgroundColor: 'transparent' },
          content: { backgroundColor: 'transparent', boxShadow: 'none', padding: 0 },
          mask: { backgroundColor: 'rgba(0, 0, 0, 0.2)' }
        }}
        centered
        destroyOnClose
        maskClosable
        closable={false}
        modalRender={modalRender}
      >
        <AIChat 
          onClose={() => setIsChatModalOpen(false)} 
          currentSessionId={currentSessionId}
          onSessionChange={handleSessionChange}
          isGuest={!isAuthenticated}
        />
      </Modal>

      {/* Floating Chat Button */}
      <FloatingChatButton 
        onClick={handleOpenChat}
        isMobile={isMobile}
      />
    </Flex>
  );
}

export default MudrasPage;
