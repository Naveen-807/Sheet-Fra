// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title SheetFraRegistry
 * @notice On-chain audit log linking Google Sheet IDs to wallet addresses on Polkadot Hub.
 * @dev Uses OpenZeppelin Ownable, ReentrancyGuard, and Pausable for security.
 */
contract SheetFraRegistry is Ownable, ReentrancyGuard, Pausable {
    struct SheetLink {
        bytes32 sheetHash;
        address wallet;
        uint256 linkedAt;
        bool active;
    }

    mapping(bytes32 => SheetLink) public links;
    mapping(address => bytes32[]) private _walletSheets;

    uint256 public totalLinks;

    event SheetLinked(bytes32 indexed sheetHash, address indexed wallet, uint256 timestamp);
    event SheetUnlinked(bytes32 indexed sheetHash, address indexed wallet, uint256 timestamp);
    event SheetActionRegistered(bytes32 indexed sheetHash, address indexed wallet, bytes32 actionHash, uint8 actionType, uint256 timestamp);

    uint8 public constant ACTION_SWAP = 1;
    uint8 public constant ACTION_STAKE = 2;
    uint8 public constant ACTION_APPROVE = 3;
    uint8 public constant ACTION_XCM = 4;

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Link a Google Sheet (by hash) to the caller's wallet.
     * @param sheetHash keccak256 hash of the Google Spreadsheet ID
     */
    function linkSheet(bytes32 sheetHash) external nonReentrant whenNotPaused {
        require(sheetHash != bytes32(0), "Invalid sheet hash");
        require(!links[sheetHash].active, "Sheet already linked");

        links[sheetHash] = SheetLink({
            sheetHash: sheetHash,
            wallet: msg.sender,
            linkedAt: block.timestamp,
            active: true
        });

        _walletSheets[msg.sender].push(sheetHash);
        totalLinks++;

        emit SheetLinked(sheetHash, msg.sender, block.timestamp);
    }

    /**
     * @notice Unlink a previously linked sheet. Only the original linker can unlink.
     * @param sheetHash keccak256 hash of the Google Spreadsheet ID
     */
    function unlinkSheet(bytes32 sheetHash) external nonReentrant {
        SheetLink storage link = links[sheetHash];
        require(link.active, "Sheet not linked");
        require(link.wallet == msg.sender, "Not the sheet owner");

        link.active = false;
        totalLinks--;

        emit SheetUnlinked(sheetHash, msg.sender, block.timestamp);
    }

    /**
     * @notice Get the link details for a sheet hash.
     */
    function getLink(bytes32 sheetHash) external view returns (SheetLink memory) {
        return links[sheetHash];
    }

    /**
     * @notice Get all sheet hashes linked by a wallet.
     */
    function getWalletSheets(address wallet) external view returns (bytes32[] memory) {
        return _walletSheets[wallet];
    }

    /**
     * @notice Check if a sheet is currently linked.
     */
    function isLinked(bytes32 sheetHash) external view returns (bool) {
        return links[sheetHash].active;
    }

    /**
     * @notice Register a DeFi action (swap/stake/approve/XCM) for audit trail.
     * @param sheetHash keccak256 hash of the Google Spreadsheet ID
     * @param actionHash keccak256 hash of action details (tokenIn, tokenOut, amount, etc.)
     * @param actionType 1=swap, 2=stake, 3=approve, 4=XCM
     */
    function registerAction(bytes32 sheetHash, bytes32 actionHash, uint8 actionType) external nonReentrant whenNotPaused {
        require(links[sheetHash].active, "Sheet not linked");
        require(links[sheetHash].wallet == msg.sender, "Not the sheet owner");
        require(actionType >= 1 && actionType <= 4, "Invalid action type");

        emit SheetActionRegistered(sheetHash, msg.sender, actionHash, actionType, block.timestamp);
    }

    // ── Owner controls ──────────────────────────────────────────

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
