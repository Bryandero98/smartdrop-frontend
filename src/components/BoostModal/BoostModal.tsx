"use client";

import {
    poolContractId,
    stellarNetwork,
} from "@/config";
import { useStellarWallet } from "@/context/StellarWalletContext";
import { useSetBoost } from "@/hooks/useSorobanQuery";
import { trackEvent } from "@/lib/analytics";
import { useFarmStore } from "@/store/farmStore";
import {
    Alert,
    AlertIcon,
    Badge,
    Box,
    Button,
    Flex,
    Input,
    Modal,
    ModalBody,
    ModalCloseButton,
    ModalContent,
    ModalHeader,
    ModalOverlay,
    Slider,
    SliderFilledTrack,
    SliderMark,
    SliderThumb,
    SliderTrack,
    Spinner,
    Text,
} from "@chakra-ui/react";
import { useEffect, useState } from "react";

type BoostStep = "idle" | "submitting" | "success" | "error";

export default function BoostModal() {
    const selectedPosition = useFarmStore((s) => s.selectedPosition);
    const isBoost = useFarmStore((s) => s.activeModal === "boost");
    const close = useFarmStore((s) => s.close);
    const position = selectedPosition;
    const { publicKey, isNetworkMismatch } = useStellarWallet();
    const setBoostMutation = useSetBoost();

    const currentBoost = position?.boostAllocation ?? 0;
    const [allocation, setAllocation] = useState(currentBoost);
    const [step, setStep] = useState<BoostStep>("idle");
    const [error, setError] = useState<string | null>(null);

    const selectedPoolContractId = position?.contractAddress || poolContractId;

    useEffect(() => {
        if (isBoost && position) {
            setAllocation(position.boostAllocation ?? 0);
            setStep("idle");
            setError(null);
        }
    }, [isBoost, position]);

    if (!position) return null;

    const handleClose = () => {
        if (step === "submitting") return;
        close();
    };

    const hasStake = position.lockedAmount > 0;
    const allocationChanged = allocation !== currentBoost;
    const isProcessing = step === "submitting";

    const handleSetBoost = async () => {
        if (!publicKey) {
            setError("Connect your Freighter wallet to set boost.");
            setStep("error");
            return;
        }
        if (isNetworkMismatch) {
            setError(`Switch Freighter to ${stellarNetwork} to set boost.`);
            setStep("error");
            return;
        }
        if (!selectedPoolContractId) {
            setError("Pool contract is not configured.");
            setStep("error");
            return;
        }
        if (!hasStake) {
            setError("You need to deposit before setting a boost allocation.");
            setStep("error");
            return;
        }

        setError(null);
        setStep("submitting");
        trackEvent("boost_initiated", {
            farm: position.name,
            symbol: position.symbol,
            allocation,
            previousAllocation: currentBoost,
        });

        setBoostMutation.mutate(
            { poolId: selectedPoolContractId, allocationPercentage: allocation },
            {
                onSuccess: (result) => {
                    if (result.success) {
                        setStep("success");
                        trackEvent("boost_succeeded", {
                            farm: position.name,
                            symbol: position.symbol,
                            allocation,
                        });
                    } else {
                        setError(result.error ?? "Boost configuration failed.");
                        setStep("error");
                        trackEvent("boost_failed", {
                            farm: position.name,
                            symbol: position.symbol,
                            reason: result.errorCode ?? "FAILED",
                        });
                    }
                },
                onError: (err: Error) => {
                    setError(err.message);
                    setStep("error");
                    trackEvent("boost_failed", {
                        farm: position.name,
                        symbol: position.symbol,
                        reason: err.message,
                    });
                },
            },
        );
    };

    return (
        <Modal isOpen={isBoost} onClose={handleClose}>
            <ModalOverlay backdropFilter="blur(3px)" />
            <ModalContent
                bg="app.surface"
                color="app.text"
                borderRadius="3xl"
                mx={{ base: 4, md: "auto" }}
            >
                <ModalHeader mx="auto">Set Boost - {position.symbol}</ModalHeader>
                <ModalCloseButton isDisabled={isProcessing} />
                <ModalBody p={{ base: 4, md: 8 }}>
                    {step === "success" ? (
                        <Flex direction="column" gap={4} align="center" textAlign="center">
                            <Badge colorScheme="green" borderRadius="full" px={3} py={1}>
                                Boost updated
                            </Badge>
                            <Text fontSize="sm" color="app.muted">
                                Your boost allocation has been set to {allocation}% for {position.symbol}.
                            </Text>
                            <Button
                                borderRadius="2xl"
                                w="full"
                                bg="app.accent"
                                color="app.onAccent"
                                _hover={{ opacity: 0.9 }}
                                onClick={handleClose}
                            >
                                Done
                            </Button>
                        </Flex>
                    ) : (
                        <Flex direction="column" gap={6}>
                            <Box border="1px solid" borderColor="app.border" borderRadius="2xl" p={3}>
                                <Flex justify="space-between" fontSize="sm" py={1}>
                                    <Text color="app.muted">Current boost</Text>
                                    <Text>{currentBoost}%</Text>
                                </Flex>
                                <Flex justify="space-between" fontSize="sm" py={1}>
                                    <Text color="app.muted">Your stake</Text>
                                    <Text>{position.stake} {position.symbol}</Text>
                                </Flex>
                            </Box>

                            {!hasStake && (
                                <Alert
                                    status="warning"
                                    borderRadius="2xl"
                                    bg="#2a2412"
                                    color="#f6c453"
                                    fontSize="sm"
                                >
                                    <AlertIcon color="#f6c453" />
                                    You need to deposit to this pool before setting a boost allocation.
                                </Alert>
                            )}

                            <Flex direction="column" gap={2}>
                                <Text fontSize="2xs" color="app.muted">
                                    Boost allocation (0-100%)
                                </Text>
                                <Slider
                                    value={allocation}
                                    onChange={setAllocation}
                                    min={0}
                                    max={100}
                                    step={5}
                                    isDisabled={!hasStake || isProcessing}
                                    colorScheme="green"
                                >
                                    <SliderMark value={0} mt={2} fontSize="xs" color="app.muted">
                                        0%
                                    </SliderMark>
                                    <SliderMark value={50} mt={2} fontSize="xs" color="app.muted">
                                        50%
                                    </SliderMark>
                                    <SliderMark value={100} mt={2} fontSize="xs" color="app.muted">
                                        100%
                                    </SliderMark>
                                    <SliderTrack bg="app.border">
                                        <SliderFilledTrack bg="app.accent" />
                                    </SliderTrack>
                                    <SliderThumb boxSize={6} />
                                </Slider>
                                <Flex justify="center">
                                    <Text fontSize="2xl" fontWeight="bold" color="app.accent">
                                        {allocation}%
                                    </Text>
                                </Flex>
                            </Flex>

                            {allocation > 0 && (
                                <Box border="1px solid" borderColor="app.border" borderRadius="2xl" p={3}>
                                    <Text fontSize="xs" color="app.muted">
                                        Allocating {allocation}% of your credits as boost will multiply
                                        your farming rewards. This allocation applies to all future
                                        credit emissions until you change it.
                                    </Text>
                                </Box>
                            )}

                            {error && step === "error" && (
                                <Alert
                                    status="error"
                                    borderRadius="2xl"
                                    bg="#2a1414"
                                    color="#ff8080"
                                    fontSize="sm"
                                >
                                    <AlertIcon color="#ff8080" />
                                    {error}
                                </Alert>
                            )}

                            <Button
                                borderRadius="2xl"
                                bg="app.accent"
                                color="app.onAccent"
                                _hover={{ opacity: 0.9 }}
                                isDisabled={!hasStake || !allocationChanged || isProcessing || isNetworkMismatch}
                                onClick={() => void handleSetBoost()}
                                w="full"
                            >
                                {isProcessing ? (
                                    <Flex align="center" gap={2}>
                                        <Spinner size="sm" />
                                        <Text>Setting boost...</Text>
                                    </Flex>
                                ) : (
                                    "Set Boost"
                                )}
                            </Button>
                        </Flex>
                    )}
                </ModalBody>
            </ModalContent>
        </Modal>
    );
}
