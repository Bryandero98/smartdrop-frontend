"use client";

import { useState } from "react";
import {
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  Input,
  Select,
  Spinner,
  Text,
  useToast,
} from "@chakra-ui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAlert,
  deleteAlert,
  listAlerts,
  backendQueryRetry,
  type Alert,
} from "@/lib/backend";
import { QueryErrorAlert } from "@/components/QueryErrorAlert/QueryErrorAlert";

export default function AlertsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState("");
  const [asset, setAsset] = useState("");
  const [type, setType] = useState<Alert["type"]>("above");
  const [thresholdUsd, setThresholdUsd] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");

  const hasKey = apiKey.trim().length > 0;

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: ["alerts", apiKey],
    queryFn: () => listAlerts(apiKey),
    enabled: hasKey,
    ...backendQueryRetry,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createAlert(apiKey, {
        asset: asset.trim().toUpperCase(),
        type,
        threshold_usd: Number(thresholdUsd),
        webhook_url: webhookUrl.trim(),
        webhook_secret: webhookSecret,
      }),
    onSuccess: () => {
      toast({ title: "Alert created", status: "success", duration: 4000 });
      setAsset("");
      setThresholdUsd("");
      setWebhookUrl("");
      setWebhookSecret("");
      queryClient.invalidateQueries({ queryKey: ["alerts", apiKey] });
    },
    onError: (err) =>
      toast({
        title: "Failed to create alert",
        description: err instanceof Error ? err.message : undefined,
        status: "error",
        duration: 6000,
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAlert(apiKey, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alerts", apiKey] }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!asset.trim() || !thresholdUsd || !webhookUrl.trim() || webhookSecret.length < 8) {
      toast({
        title: "Fill in asset, threshold, webhook URL, and an 8+ character secret",
        status: "warning",
        duration: 5000,
      });
      return;
    }
    createMutation.mutate();
  };

  return (
    <Flex direction="column" align="center" px={{ base: 6, md: 16 }} py={10} gap={8}>
      <Box w="100%" maxW="900px">
        <HStack spacing={2} mb={5}>
          <Box w="6px" h="6px" borderRadius="full" bg="app.accent" boxShadow="0 0 8px var(--chakra-colors-app-accent)" />
          <Text fontSize="xs" fontWeight="semibold" letterSpacing="wide" color="app.muted" textTransform="uppercase">
            Monitoring
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
          Price alerts
        </Text>
        <Text color="app.muted" fontSize="lg">
          Get notified via webhook when an asset crosses a price threshold.
        </Text>
      </Box>

      <Box
        w="100%"
        maxW="900px"
        border="1px solid"
        borderColor="app.border"
        borderRadius="card"
        bg="app.surface"
        boxShadow="card"
        p={6}
      >
        <Text fontSize="sm" color="app.muted" mb={1}>API key</Text>
        <Input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Your smartdrop-backend API key"
          fontFamily="mono"
          fontSize="sm"
          borderColor="app.border"
          bg="app.inputBg"
          _hover={{ borderColor: "app.accent" }}
          _focus={{ boxShadow: "none", borderColor: "app.accent" }}
        />
        <Text fontSize="xs" color="app.muted" mt={2}>
          This endpoint requires backend authentication. The key is only kept in this page&apos;s memory — it is never stored or sent anywhere except the backend API.
        </Text>
      </Box>

      {hasKey && (
        <>
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
            <Text fontWeight="semibold" mb={4}>Create a new alert</Text>
            <Flex direction="column" gap={4}>
              <Flex gap={4} direction={{ base: "column", md: "row" }}>
                <Box flex={1}>
                  <Text fontSize="sm" color="app.muted" mb={1}>Asset</Text>
                  <Input
                    value={asset}
                    onChange={(e) => setAsset(e.target.value)}
                    placeholder="XLM"
                    borderColor="app.border"
                    bg="app.inputBg"
                    _hover={{ borderColor: "app.accent" }}
                    _focus={{ boxShadow: "none", borderColor: "app.accent" }}
                  />
                </Box>
                <Box flex={1}>
                  <Text fontSize="sm" color="app.muted" mb={1}>Type</Text>
                  <Select
                    value={type}
                    onChange={(e) => setType(e.target.value as Alert["type"])}
                    borderColor="app.border"
                    bg="app.inputBg"
                    _hover={{ borderColor: "app.accent" }}
                    _focus={{ boxShadow: "none", borderColor: "app.accent" }}
                  >
                    <option value="above">Price above</option>
                    <option value="below">Price below</option>
                    <option value="change_pct">% change</option>
                  </Select>
                </Box>
                <Box flex={1}>
                  <Text fontSize="sm" color="app.muted" mb={1}>Threshold (USD)</Text>
                  <Input
                    type="number"
                    step="any"
                    value={thresholdUsd}
                    onChange={(e) => setThresholdUsd(e.target.value)}
                    placeholder="0.15"
                    borderColor="app.border"
                    bg="app.inputBg"
                    _hover={{ borderColor: "app.accent" }}
                    _focus={{ boxShadow: "none", borderColor: "app.accent" }}
                  />
                </Box>
              </Flex>
              <Box>
                <Text fontSize="sm" color="app.muted" mb={1}>Webhook URL</Text>
                <Input
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://example.com/alerts"
                  borderColor="app.border"
                  bg="app.inputBg"
                  _hover={{ borderColor: "app.accent" }}
                  _focus={{ boxShadow: "none", borderColor: "app.accent" }}
                />
              </Box>
              <Box>
                <Text fontSize="sm" color="app.muted" mb={1}>Webhook secret (min 8 characters)</Text>
                <Input
                  type="password"
                  value={webhookSecret}
                  onChange={(e) => setWebhookSecret(e.target.value)}
                  borderColor="app.border"
                  bg="app.inputBg"
                  _hover={{ borderColor: "app.accent" }}
                  _focus={{ boxShadow: "none", borderColor: "app.accent" }}
                />
              </Box>
              <Button
                type="submit"
                alignSelf="flex-start"
                bg="app.accent"
                color="app.onAccent"
                _hover={{ opacity: 0.9 }}
                isLoading={createMutation.isPending}
              >
                Create alert
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
                fallbackMessage="Failed to load alerts"
              />
            ) : !data || data.data.length === 0 ? (
              <Flex
                justify="center"
                py={12}
                border="1px dashed"
                borderColor="app.border"
                borderRadius="card"
                bg="app.surface"
              >
                <Text color="app.muted">No alerts configured yet.</Text>
              </Flex>
            ) : (
              <Flex direction="column" gap={3}>
                {data.data.map((alert) => (
                  <Flex
                    key={alert.id}
                    justify="space-between"
                    align="center"
                    p={5}
                    border="1px solid"
                    borderColor="app.border"
                    borderRadius="card"
                    bg="app.surface"
                    boxShadow="card"
                    flexWrap="wrap"
                    gap={3}
                  >
                    <Box>
                      <HStack>
                        <Text fontWeight="semibold">{alert.asset}</Text>
                        <Badge borderRadius="full" px={2}>{alert.type}</Badge>
                      </HStack>
                      <Text fontSize="sm" color="app.muted" fontFamily="mono">
                        threshold ${alert.threshold_usd} · {alert.webhook_url}
                      </Text>
                    </Box>
                    <Button
                      size="sm"
                      variant="outline"
                      borderColor="app.border"
                      color="#ff8080"
                      onClick={() => deleteMutation.mutate(alert.id)}
                      isLoading={deleteMutation.isPending && deleteMutation.variables === alert.id}
                    >
                      Delete
                    </Button>
                  </Flex>
                ))}
              </Flex>
            )}
          </Box>
        </>
      )}
    </Flex>
  );
}
