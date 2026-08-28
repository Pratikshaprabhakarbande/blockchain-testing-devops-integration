// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title IdentityAndAccess
 * @notice Manages user identity lifecycle and role assignment.
 * @dev Lifecycle: NotRegistered -> Pending -> Verified -> Role Assigned
 *      Only the contract owner (deployer/admin) can perform state changes.
 */
contract IdentityAndAccess is Ownable {

    enum Status { NotRegistered, Pending, Verified, Revoked }
    enum Role { None, User, AssetManager, Admin }

    struct Identity {
        bytes32 nameHash;
        Status status;
        Role role;
    }

    mapping(address => Identity) private identities;

    // Events
    event IdentityRegistered(address indexed user, bytes32 nameHash);
    event IdentityVerified(address indexed user);
    event IdentityRevoked(address indexed user);
    event RoleAssigned(address indexed user, Role role);
    event RoleRevoked(address indexed user);

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Register a new identity. Sets status to Pending.
     * @param _addr The user's wallet address
     * @param _nameHash A hash representing the user's name (stored off-chain)
     */
    function registerIdentity(address _addr, bytes32 _nameHash) external onlyOwner {
        require(_addr != address(0), "Invalid address");
        require(identities[_addr].status == Status.NotRegistered, "Already registered");

        identities[_addr] = Identity({
            nameHash: _nameHash,
            status: Status.Pending,
            role: Role.None
        });

        emit IdentityRegistered(_addr, _nameHash);
    }

    /**
     * @notice Admin verifies a pending identity.
     * @param _addr The user's wallet address
     */
    function verifyIdentity(address _addr) external onlyOwner {
        require(identities[_addr].status == Status.Pending, "Not pending");

        identities[_addr].status = Status.Verified;
        emit IdentityVerified(_addr);
    }

    /**
     * @notice Assign a role to a verified identity.
     * @param _addr The user's wallet address
     * @param _role The role to assign
     */
    function assignRole(address _addr, Role _role) external onlyOwner {
        require(identities[_addr].status == Status.Verified, "Not verified");
        require(_role != Role.None, "Cannot assign None role");

        identities[_addr].role = _role;
        emit RoleAssigned(_addr, _role);
    }

    /**
     * @notice Revoke a user's role (sets back to None).
     * @param _addr The user's wallet address
     */
    function revokeRole(address _addr) external onlyOwner {
        require(identities[_addr].role != Role.None, "No role to revoke");

        identities[_addr].role = Role.None;
        emit RoleRevoked(_addr);
    }

    /**
     * @notice Revoke an identity entirely.
     * @param _addr The user's wallet address
     */
    function revokeIdentity(address _addr) external onlyOwner {
        require(
            identities[_addr].status == Status.Pending ||
            identities[_addr].status == Status.Verified,
            "Cannot revoke"
        );

        identities[_addr].status = Status.Revoked;
        identities[_addr].role = Role.None;
        emit IdentityRevoked(_addr);
    }

    /**
     * @notice Get identity details for an address.
     */
    function getIdentity(address _addr) external view returns (bytes32 nameHash, Status status, Role role) {
        Identity memory id = identities[_addr];
        return (id.nameHash, id.status, id.role);
    }

    /**
     * @notice Check if an address has a specific role.
     */
    function hasRole(address _addr, Role _role) external view returns (bool) {
        return identities[_addr].role == _role && identities[_addr].status == Status.Verified;
    }

    /**
     * @notice Check if address has Admin or AssetManager role (used by AssetRegistry).
     */
    function canManageAssets(address _addr) external view returns (bool) {
        Identity memory id = identities[_addr];
        return id.status == Status.Verified &&
               (id.role == Role.Admin || id.role == Role.AssetManager);
    }

    /**
     * @notice Check if address has Admin role.
     */
    function isAdmin(address _addr) external view returns (bool) {
        return identities[_addr].role == Role.Admin && identities[_addr].status == Status.Verified;
    }
}
