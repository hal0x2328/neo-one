import * as React from 'react';
import { MdClose } from 'react-icons/md';
import { Backdrop, Button, Card, Flex, Heading, Overlay, Portal, Shadow, styled } from 'reakit';
import { prop } from 'styled-tools';
// tslint:disable-next-line no-any
export type OverlayProps = any;

const StyledHeader = styled(Flex)`
  background-color: ${prop('theme.primary')};
  align-items: center;
  justify-content: space-between;
  margin: 0;
  padding: 16px;
`;

interface Props {
  readonly title: string;
  readonly renderDialog: (overlay: OverlayProps) => React.ReactNode;
  readonly children: (overlay: OverlayProps) => React.ReactNode;
}

export function Dialog({ children, renderDialog, title }: Props) {
  return (
    <Overlay.Container>
      {(overlay: OverlayProps) => (
        <>
          {children(overlay)}
          <Backdrop as={[Portal, Overlay.Hide]} {...overlay} />
          <Overlay as={[Portal, Card]} slide fade gutter={16} {...overlay}>
            <Shadow />
            <Card.Fit as={StyledHeader}>
              <Heading as="h3" margin="0">
                {title}
              </Heading>
              <Button
                fontSize={20}
                onClick={overlay.hide}
                border="none"
                backgroundColor="transparent"
                borderRadius={50}
              >
                <MdClose />
              </Button>
            </Card.Fit>
            {renderDialog(overlay)}
          </Overlay>
        </>
      )}
    </Overlay.Container>
  );
}