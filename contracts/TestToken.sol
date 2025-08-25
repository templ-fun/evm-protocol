// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IERC20Test {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function decimals() external view returns (uint8);
}

contract TestToken is IERC20Test {
    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;
    
    string public name;
    string public symbol;
    uint8 private _decimals;
    uint256 public totalSupply;

    constructor(string memory _name, string memory _symbol, uint8 decimals_) {
        name = _name;
        symbol = _symbol;
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function balanceOf(address account) public view override returns (uint256) {
        return _balances[account];
    }

    function transfer(address recipient, uint256 amount) public override returns (bool) {
        require(_balances[msg.sender] >= amount, "Insufficient balance");
        _balances[msg.sender] -= amount;
        _balances[recipient] += amount;
        return true;
    }

    function approve(address spender, uint256 amount) public override returns (bool) {
        _allowances[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount) public override returns (bool) {
        require(_balances[sender] >= amount, "Insufficient balance");
        require(_allowances[sender][msg.sender] >= amount, "Insufficient allowance");
        
        _balances[sender] -= amount;
        _balances[recipient] += amount;
        _allowances[sender][msg.sender] -= amount;
        
        return true;
    }

    function mint(address to, uint256 amount) public {
        _balances[to] += amount;
        totalSupply += amount;
    }

    function burn(address from, uint256 amount) public {
        require(_balances[from] >= amount, "Insufficient balance");
        _balances[from] -= amount;
        totalSupply -= amount;
    }
}