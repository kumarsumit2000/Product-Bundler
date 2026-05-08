import { Modal, Text } from "@shopify/polaris";

type Props = {
  open: boolean;
  title: string;
  body: string;
  destructiveLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export function ConfirmModal({
  open,
  title,
  body,
  destructiveLabel = "Delete",
  loading,
  onConfirm,
  onClose,
}: Props) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      primaryAction={{
        content: destructiveLabel,
        destructive: true,
        loading: !!loading,
        onAction: onConfirm,
      }}
      secondaryActions={[{ content: "Cancel", onAction: onClose, disabled: !!loading }]}
    >
      <Modal.Section>
        <Text as="p">{body}</Text>
      </Modal.Section>
    </Modal>
  );
}
