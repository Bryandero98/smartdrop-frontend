"use client";

import { useState } from "react";
import {
  Badge,
  Box,
  Button,
  Checkbox,
  Flex,
  HStack,
  Input,
  Spinner,
  Text,
  useToast,
  Wrap,
} from "@chakra-ui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createWebhook,
  deleteWebhook,
  listWebhooks,
  testWebhook,
  WEBHOOK_EVENTS,
  backendQueryRetry,
} from "@/lib/backend";
import { QueryErrorAlert } from "@/components/QueryErrorAlert/QueryErrorAlert";

export default function WebhooksPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: ["webhooks"],
    queryFn: listWebhooks,
    ...backendQueryRetry,
  });

  const createMutation = useMutation({
    mutationFn: createWebhook,
    onSuccess: () => {
      toast({ title: "Webhook created", status: "success", duration: 4000 });
      setUrl("");
      setDescription("");
      setSelectedEvents([]);
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
    },
    onError: (err) => {
      toast({
        title: "Failed to create webhook",
        description: err instanceof Error ? err.message : undefined,
        status: "error",
        duration: 6000,
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteWebhook,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["webhooks"] }),
  });

  const testMutation = useMutation({
    mutationFn: testWebhook,
    onSuccess: () => toast({ title: "Test ping sent", status: "success", duration: 4000 }),
    onError: (err) =>
      toast({
        title: "Test ping failed",
        description: err instanceof Error ? err.message : undefined,
        status: "error",
        duration: 6000,
      }),
  });

  const toggleEvent = (event: string) => {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || selectedEvents.length === 0) {
      toast({ title: "URL and at least one event are required", status: "warning", duration: 4000 });
      return;
    }
    createMutation.mutate({ url: url.trim(), events: selectedEvents, description: description.trim() || undefined });
  };

  return (
    <Flex direction="column" align="center" px={{ base: 6, md: 16 }} py={10} gap={8}>
      <Box w="100%" maxW="900px">
        <HStack spacing={2} mb={5}>
          <Box w="6px" h="6px" borderRadius="full" bg="app.accent" boxShadow="0 0 8px var(--chakra-colors-app-accent)" />
          <Text fontSize="xs" fontWeight="semibold" letterSpacing="wide" color="app.muted" textTransform="uppercase">
            Integrations
          </Text>
        </HStack>
        <Text
          fontSize={{ base: "4xl", md: "5xl" }}
          fontWeight="extrabold"
          letterSpacing="tight"
          mb={3}
          bgGradient="linear(to-r, app.text, app.accent)"
          bgClip="text"
        >
          Webhooks
        </Text>
        <Text color="app.muted" fontSize="lg">
          Register an endpoint to receive signed, real-time notifications for pool and price events.
        </Text>
      </Box>

      <Box
        as="form"
        onSubmit={handleSubmit}
        w="100%"
        maxW="900px"
        border="1px solid"
        borderColor="app.border"
        borderRadius="card"
        bg="app.surface"
        boxShadow="card"
        p={6}
      >
        <Text fontWeight="semibold" mb={4}>Register a new endpoint</Text>
        <Flex direction="column" gap={4}>
          <Box>
            <Text fontSize="sm" color="app.muted" mb={1}>Endpoint URL</Text>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/webhooks/smartdrop"
              borderColor="app.border"
              bg="app.inputBg"
              _hover={{ borderColor: "app.accent" }}
              _focus={{ boxShadow: "none", borderColor: "app.accent" }}
            />
          </Box>
          <Box>
            <Text fontSize="sm" color="app.muted" mb={1}>Description (optional)</Text>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Production alerting bot"
              borderColor="app.border"
              bg="app.inputBg"
              _hover={{ borderColor: "app.accent" }}
              _focus={{ boxShadow: "none", borderColor: "app.accent" }}
            />
          </Box>
          <Box>
            <Text fontSize="sm" color="app.muted" mb={2}>Events</Text>
            <Wrap spacing={4}>
              {WEBHOOK_EVENTS.map((event) => (
                <Checkbox
                  key={event}
                  isChecked={selectedEvents.includes(event)}
                  onChange={() => toggleEvent(event)}
                  colorScheme="green"
                >
                  <Text fontFamily="mono" fontSize="sm">{event}</Text>
                </Checkbox>
              ))}
            </Wrap>
          </Box>
          <Button
            type="submit"
            alignSelf="flex-start"
            bg="app.accent"
            color="app.onAccent"
            _hover={{ opacity: 0.9 }}
            isLoading={createMutation.isPending}
          >
            Create webhook
          </Button>
        </Flex>
      </Box>

      <Box w="100%" maxW="900px">
        {isLoading ? (
          <Flex justify="center" py={10}>
            <Spinner color="app.accent" size="xl" thickness="3px" />
          </Flex>
        ) : isError ? (
          <QueryErrorAlert
            error={error}
            onRetry={() => refetch()}
            isRetrying={isFetching}
            fallbackMessage="Failed to load webhooks"
          />
        ) : !data || data.webhooks.length === 0 ? (
          <Flex
            justify="center"
            py={12}
            border="1px dashed"
            borderColor="app.border"
            borderRadius="card"
            bg="app.surface"
          >
            <Text color="app.muted">No webhooks registered yet.</Text>
          </Flex>
        ) : (
          <Flex direction="column" gap={3}>
            {data.webhooks.map((webhook) => (
              <Box
                key={webhook.id}
                p={5}
                border="1px solid"
                borderColor="app.border"
                borderRadius="card"
                bg="app.surface"
                boxShadow="card"
              >
                <Flex justify="space-between" align="flex-start" gap={3} flexWrap="wrap">
                  <Box minW={0}>
                    <Text fontWeight="semibold" isTruncated>{webhook.url}</Text>
                    {webhook.description && (
                      <Text fontSize="sm" color="app.muted">{webhook.description}</Text>
                    )}
                    <Wrap mt={2} spacing={2}>
                      {webhook.events.map((event) => (
                        <Badge key={event} borderRadius="full" px={2} fontFamily="mono" fontSize="xs">
                          {event}
                        </Badge>
                      ))}
                    </Wrap>
                  </Box>
                  <HStack>
                    <Badge colorScheme={webhook.active ? "green" : "gray"} borderRadius="full" px={2}>
                      {webhook.active ? "Active" : "Inactive"}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      borderColor="app.border"
                      onClick={() => testMutation.mutate(webhook.id)}
                      isLoading={testMutation.isPending && testMutation.variables === webhook.id}
                    >
                      Send test
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      borderColor="app.border"
                      color="#ff8080"
                      onClick={() => deleteMutation.mutate(webhook.id)}
                      isLoading={deleteMutation.isPending && deleteMutation.variables === webhook.id}
                    >
                      Delete
                    </Button>
                  </HStack>
                </Flex>
              </Box>
            ))}
          </Flex>
        )}
      </Box>
    </Flex>
  );
}
