// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title IXcm
 * @notice Interface for Polkadot Hub XCM precompile at 0xA0000
 * @dev See: https://docs.polkadot.com/develop/smart-contracts/precompiles/xcm-precompile
 */
interface IXcm {
    struct Weight {
        uint64 refTime;
        uint64 proofSize;
    }
    function weighMessage(bytes calldata message) external view returns (Weight memory weight);
    function execute(bytes calldata message, Weight calldata weight) external;
    function send(bytes calldata destination, bytes calldata message) external;
}

/// @dev XCM precompile address on Polkadot Hub
address constant XCM_PRECOMPILE_ADDRESS = address(0xA0000);

/**
 * @title SheetFraXcmBridge
 * @notice Enables spreadsheet-driven XCM operations on Polkadot Hub (Track 2: PVM precompiles)
 * @dev Uses Polkadot's XCM precompile for cross-chain visibility and operations
 */
contract SheetFraXcmBridge is Ownable, ReentrancyGuard {
    IXcm public constant XCM = IXcm(XCM_PRECOMPILE_ADDRESS);

    event XcmWeighRequested(address indexed caller, uint64 refTime, uint64 proofSize, string sheetRef);
    event XcmExecuteRequested(address indexed caller, bytes32 operationId, string sheetRef);

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Estimate weight for an XCM message (call XCM precompile)
     * @param xcmMessage SCALE-encoded XCM message
     * @param sheetRef Optional reference to the originating sheet (for audit)
     */
    function weighXcmMessage(bytes calldata xcmMessage, string calldata sheetRef)
        external
        returns (uint64 refTime, uint64 proofSize)
    {
        IXcm.Weight memory w = XCM.weighMessage(xcmMessage);
        emit XcmWeighRequested(msg.sender, w.refTime, w.proofSize, sheetRef);
        return (w.refTime, w.proofSize);
    }

    /**
     * @notice Execute an XCM message locally (call XCM precompile)
     * @param xcmMessage SCALE-encoded XCM message
     * @param maxRefTime Maximum refTime to allow
     * @param maxProofSize Maximum proofSize to allow
     * @param operationId Unique identifier for this operation (for audit)
     * @param sheetRef Optional reference to the originating sheet
     */
    function executeXcmMessage(
        bytes calldata xcmMessage,
        uint64 maxRefTime,
        uint64 maxProofSize,
        bytes32 operationId,
        string calldata sheetRef
    ) external nonReentrant {
        IXcm.Weight memory w = XCM.weighMessage(xcmMessage);
        require(w.refTime <= maxRefTime, "refTime exceeds max");
        require(w.proofSize <= maxProofSize, "proofSize exceeds max");

        XCM.execute(xcmMessage, w);
        emit XcmExecuteRequested(msg.sender, operationId, sheetRef);
    }
}
